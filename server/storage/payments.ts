import { eq, and, desc, gt, gte, isNull, ne, or } from "drizzle-orm";
import {
  users,
  payments,
  bankTransactions,
  walletTransactions,
  cashTransactions,
} from '@shared/schema';
import type {
  User,
  Payment,
  InsertPayment,
  BankTransaction,
  WalletTransaction,
  InsertWalletTransaction,
  CashTransaction,
  InsertCashTransaction,
} from '@shared/schema';
import { db } from "./db";
import { createPaymentWithWalletInTransaction } from "./helpers";
import type {
  ImportedBankTransaction,
  ReconcileBankTransactionInput,
  ReconcileBankTransactionResult,
  RetryBankTransactionMatchingResult,
} from "./types";

export type BankReconciliationErrorCode =
  | "INVALID_INPUT"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_ALREADY_RECONCILED"
  | "TRANSACTION_NOT_ELIGIBLE"
  | "USER_NOT_FOUND"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_USER_MISMATCH"
  | "PAYMENT_ALREADY_PAID"
  | "PAYMENT_ALREADY_MATCHED"
  | "PAYMENT_RECONCILED"
  | "UNDERPAYMENT"
  | "FRACTIONAL_WALLET_CREDIT";

export class BankReconciliationError extends Error {
  constructor(
    public readonly code: BankReconciliationErrorCode,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "BankReconciliationError";
  }
}

function variableSymbolForMatching(value: string): string {
  return value.replace(/^0+(?=\d)/, "");
}

function normalizedPersonName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function findAutomaticPaymentMatch(
  database: any,
  transaction: Pick<BankTransaction, "amount" | "variableSymbol" | "payerName">,
): { payment?: Payment; variableSymbolAmountMismatch: boolean } {
  const alreadyMatchedPaymentIds = new Set(
    (database.select({ paymentId: bankTransactions.matchedPaymentId })
      .from(bankTransactions)
      .all() as Array<{ paymentId: number | null }>)
      .map(row => row.paymentId)
      .filter((id): id is number => id !== null),
  );
  const unpaidPayments = (database.select().from(payments)
    .where(ne(payments.status, "paid"))
    .all() as Payment[])
    .filter(payment => !alreadyMatchedPaymentIds.has(payment.id));
  const exactAmountPayments = unpaidPayments.filter(payment => (
    Math.max(0, payment.amount - payment.walletAppliedAmount) * 100 === transaction.amount
  ));

  const payerName = normalizedPersonName(transaction.payerName);
  const usersById = new Map(
    (database.select().from(users).all() as User[])
      .filter(user => user.isActive && user.emailVerified)
      .map(user => [user.id, user]),
  );
  const uniqueNameMatch = (candidates: Payment[]) => {
    if (!payerName) return undefined;
    const matches = candidates.filter(payment => {
      const user = usersById.get(payment.userId);
      return user ? normalizedPersonName(user.name) === payerName : false;
    });
    return matches.length === 1 ? matches[0] : undefined;
  };

  if (transaction.variableSymbol) {
    const matchingVariableSymbol = variableSymbolForMatching(transaction.variableSymbol);
    const variableSymbolPayments = unpaidPayments.filter(payment => (
      payment.variableSymbol === matchingVariableSymbol
    ));
    const exactVariableSymbolPayments = variableSymbolPayments.filter(payment => (
      Math.max(0, payment.amount - payment.walletAppliedAmount) * 100 === transaction.amount
    ));

    if (exactVariableSymbolPayments.length === 1) {
      return { payment: exactVariableSymbolPayments[0], variableSymbolAmountMismatch: false };
    }
    if (exactVariableSymbolPayments.length > 1) {
      return {
        payment: uniqueNameMatch(exactVariableSymbolPayments),
        variableSymbolAmountMismatch: false,
      };
    }

    const payment = uniqueNameMatch(exactAmountPayments);
    return {
      payment,
      variableSymbolAmountMismatch: variableSymbolPayments.length > 0 && !payment,
    };
  }

  return {
    payment: uniqueNameMatch(exactAmountPayments),
    variableSymbolAmountMismatch: false,
  };
}

export class PaymentsStore {
  // ============ PAYMENTS ============
  getPayment(id: number): Payment | undefined {
    return db.select().from(payments).where(eq(payments.id, id)).get();
  }

  getPaymentsByUser(userId: number): Payment[] {
    return db.select().from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.dueDate))
      .all();
  }

  getAllPayments(): (Payment & { user: Pick<User, 'id' | 'name'> })[] {
    const allPayments = db.select().from(payments).orderBy(desc(payments.dueDate)).all();
    return allPayments.map(p => {
      const user = db.select().from(users).where(eq(users.id, p.userId)).get();
      return { ...p, user: { id: user!.id, name: user!.name } };
    });
  }

  createPayment(payment: InsertPayment): Payment {
    return db.transaction(tx => createPaymentWithWalletInTransaction(tx, payment));
  }

  createPayments(paymentList: InsertPayment[]): Payment[] {
    if (paymentList.length === 0) return [];
    return db.transaction(tx => paymentList.map(payment =>
      createPaymentWithWalletInTransaction(tx, payment),
    ));
  }

  updatePaymentStatus(id: number, status: string): Payment | undefined {
    return db.transaction(database => {
      if (status !== "paid") {
        const bankMatch = database.select({ id: bankTransactions.id })
          .from(bankTransactions)
          .where(eq(bankTransactions.matchedPaymentId, id))
          .get();
        if (bankMatch) {
          throw new BankReconciliationError(
            "PAYMENT_RECONCILED",
            "Platbu uhradenú bankovou transakciou nemožno znovu otvoriť bez zrušenia párovania",
            409,
          );
        }
      }

      return database.update(payments)
        .set({ status })
        .where(eq(payments.id, id))
        .returning()
        .get();
    });
  }

  deletePayment(id: number): void {
    db.transaction(database => {
      const bankMatch = database.select({ id: bankTransactions.id })
        .from(bankTransactions)
        .where(eq(bankTransactions.matchedPaymentId, id))
        .get();
      if (bankMatch) {
        throw new BankReconciliationError(
          "PAYMENT_RECONCILED",
          "Platbu uhradenú bankovou transakciou nemožno zmazať bez zrušenia párovania",
          409,
        );
      }

      database.delete(walletTransactions)
        .where(eq(walletTransactions.paymentId, id))
        .run();
      database.delete(payments).where(eq(payments.id, id)).run();
    });
  }

  getPendingPaymentsByVariableSymbol(vs: string): Payment[] {
    return db.select().from(payments)
      .where(and(eq(payments.variableSymbol, vs), eq(payments.status, "pending")))
      .all();
  }

  // ============ BANK TRANSACTIONS ============
  getAllBankTransactions(limit = 50, fromDate?: string): BankTransaction[] {
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 50;
    const recent = db.select().from(bankTransactions)
      .where(fromDate ? gte(bankTransactions.date, fromDate) : undefined)
      .orderBy(desc(bankTransactions.date))
      .limit(safeLimit)
      .all();
    const actionable = db.select().from(bankTransactions)
      .where(and(
        fromDate ? gte(bankTransactions.date, fromDate) : undefined,
        isNull(bankTransactions.matchedPaymentId),
        isNull(bankTransactions.reconciledAt),
        gt(bankTransactions.amount, 0),
        eq(bankTransactions.currency, "CZK"),
        or(
          isNull(bankTransactions.syncError),
          eq(bankTransactions.syncError, "amount_mismatch"),
        ),
      ))
      .all();

    const byId = new Map(recent.map(transaction => [transaction.id, transaction]));
    for (const transaction of actionable) byId.set(transaction.id, transaction);
    return Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
  }

  getUnmatchedBankTransactions(): BankTransaction[] {
    return db.select().from(bankTransactions)
      .all()
      .filter(tx => tx.matchedPaymentId === null && tx.reconciledAt === null);
  }

  importBankTransaction(tx: ImportedBankTransaction): {
    transaction: BankTransaction;
    created: boolean;
    matched: boolean;
  } {
    return db.transaction(database => {
      const existing = database.select().from(bankTransactions)
        .where(eq(bankTransactions.transactionId, tx.transactionId))
        .get();
      if (existing) {
        const transaction = database.update(bankTransactions)
          .set({
            payerName: tx.payerName,
            payerAccount: tx.payerAccount,
            payerBankCode: tx.payerBankCode,
            payerIban: tx.payerIban,
            rawData: tx.rawData,
          })
          .where(eq(bankTransactions.id, existing.id))
          .returning()
          .get();
        return { transaction, created: false, matched: false };
      }

      let matchedPaymentId: number | null = null;
      let reconciledUserId: number | null = null;
      let reconciledAt: string | null = null;
      let syncError = tx.syncError;

      if (!syncError
        && Number.isSafeInteger(tx.amount)
        && tx.amount > 0
        && tx.currency === "CZK") {
        const match = findAutomaticPaymentMatch(database, tx);
        if (match.payment) {
          matchedPaymentId = match.payment.id;
          reconciledUserId = match.payment.userId;
          reconciledAt = new Date().toISOString();
        } else if (match.variableSymbolAmountMismatch) {
          syncError = "amount_mismatch";
        }
      }

      const transaction = database.insert(bankTransactions).values({
        ...tx,
        matchedPaymentId,
        reconciledUserId,
        reconciledBy: null,
        reconciledAt,
        syncError,
      }).returning().get();

      if (matchedPaymentId !== null) {
        database.update(payments)
          .set({ status: "paid" })
          .where(eq(payments.id, matchedPaymentId))
          .run();
      }

      return { transaction, created: true, matched: matchedPaymentId !== null };
    });
  }

  reconcileBankTransaction(input: ReconcileBankTransactionInput): ReconcileBankTransactionResult {
    if (!Number.isInteger(input.bankTransactionId) || input.bankTransactionId <= 0
      || !Number.isInteger(input.userId) || input.userId <= 0
      || !Number.isInteger(input.actorId) || input.actorId <= 0
      || (input.paymentId !== undefined
        && (!Number.isInteger(input.paymentId) || input.paymentId <= 0))) {
      throw new BankReconciliationError("INVALID_INPUT", "Neplatné údaje na spárovanie", 400);
    }

    return db.transaction(database => {
      const transaction = database.select().from(bankTransactions)
        .where(eq(bankTransactions.id, input.bankTransactionId))
        .get() as BankTransaction | undefined;
      if (!transaction) {
        throw new BankReconciliationError("TRANSACTION_NOT_FOUND", "Banková transakcia nebola nájdená", 404);
      }

      const existingWalletCredit = database.select().from(walletTransactions)
        .where(eq(walletTransactions.bankTransactionId, transaction.id))
        .get() as WalletTransaction | undefined;
      if (transaction.matchedPaymentId !== null
        || transaction.reconciledAt !== null
        || transaction.reconciledUserId !== null
        || existingWalletCredit) {
        throw new BankReconciliationError(
          "TRANSACTION_ALREADY_RECONCILED",
          "Banková transakcia už bola spracovaná",
          409,
        );
      }
      if (!Number.isSafeInteger(transaction.amount)
        || transaction.amount <= 0
        || transaction.currency !== "CZK"
        || (transaction.syncError !== null && transaction.syncError !== "amount_mismatch")) {
        throw new BankReconciliationError(
          "TRANSACTION_NOT_ELIGIBLE",
          "Spracovať možno iba kladnú CZK transakciu bez chyby synchronizácie",
          409,
        );
      }

      const user = database.select().from(users)
        .where(eq(users.id, input.userId))
        .get() as User | undefined;
      if (!user?.isActive || !user.emailVerified) {
        throw new BankReconciliationError("USER_NOT_FOUND", "Aktívny overený člen nebol nájdený", 404);
      }

      let payment: Payment | null = null;
      let walletCreditMinor = transaction.amount;
      if (input.paymentId !== undefined) {
        const selectedPayment = database.select().from(payments)
          .where(eq(payments.id, input.paymentId))
          .get() as Payment | undefined;
        if (!selectedPayment) {
          throw new BankReconciliationError("PAYMENT_NOT_FOUND", "Platba nebola nájdená", 404);
        }
        if (selectedPayment.userId !== user.id) {
          throw new BankReconciliationError(
            "PAYMENT_USER_MISMATCH",
            "Vybraná platba nepatrí zvolenému členovi",
            409,
          );
        }
        const outstandingAmount = selectedPayment.amount - selectedPayment.walletAppliedAmount;
        if (selectedPayment.status === "paid" || outstandingAmount <= 0) {
          throw new BankReconciliationError("PAYMENT_ALREADY_PAID", "Vybraná platba už je uhradená", 409);
        }
        const existingPaymentMatch = database.select().from(bankTransactions)
          .where(eq(bankTransactions.matchedPaymentId, selectedPayment.id))
          .get() as BankTransaction | undefined;
        if (existingPaymentMatch) {
          throw new BankReconciliationError(
            "PAYMENT_ALREADY_MATCHED",
            "Vybraná platba už je spárovaná s inou bankovou transakciou",
            409,
          );
        }
        const outstandingMinor = outstandingAmount * 100;
        if (!Number.isSafeInteger(outstandingMinor)) {
          throw new BankReconciliationError("INVALID_INPUT", "Suma platby je príliš vysoká", 400);
        }
        if (transaction.amount < outstandingMinor) {
          throw new BankReconciliationError(
            "UNDERPAYMENT",
            "Prijatá suma je nižšia ako neuhradená suma platby",
            409,
          );
        }

        walletCreditMinor = transaction.amount - outstandingMinor;
        payment = database.update(payments)
          .set({ status: "paid" })
          .where(eq(payments.id, selectedPayment.id))
          .returning()
          .get() as Payment;
      }

      if (walletCreditMinor % 100 !== 0) {
        throw new BankReconciliationError(
          "FRACTIONAL_WALLET_CREDIT",
          "Prebytok nemožno pripísať do peňaženky, pretože obsahuje haliere",
          409,
        );
      }
      const walletCredit = walletCreditMinor / 100;
      if (!Number.isSafeInteger(walletCredit)) {
        throw new BankReconciliationError("INVALID_INPUT", "Suma transakcie je príliš vysoká", 400);
      }

      if (walletCredit > 0) {
        database.insert(walletTransactions).values({
          userId: user.id,
          bankTransactionId: transaction.id,
          paymentId: null,
          amount: walletCredit,
          description: payment
            ? `Preplatok z bankovej transakcie ${transaction.transactionId}`
            : `Vklad z bankovej transakcie ${transaction.transactionId}`,
        }).run();
      }

      const reconciledAt = new Date().toISOString();
      const updatedTransaction = database.update(bankTransactions)
        .set({
          matchedPaymentId: payment?.id ?? null,
          reconciledUserId: user.id,
          reconciledBy: input.actorId,
          reconciledAt,
          syncError: null,
        })
        .where(eq(bankTransactions.id, transaction.id))
        .returning()
        .get() as BankTransaction;

      return { transaction: updatedTransaction, payment, walletCredit };
    });
  }

  retryUnmatchedBankTransactions(): RetryBankTransactionMatchingResult {
    return db.transaction(database => {
      const candidates = (database.select().from(bankTransactions).all() as BankTransaction[])
        .filter(transaction => transaction.matchedPaymentId === null
          && transaction.reconciledAt === null
          && transaction.reconciledUserId === null);
      let matched = 0;

      for (const transaction of candidates) {
        if (!Number.isSafeInteger(transaction.amount)
          || transaction.amount <= 0
          || transaction.currency !== "CZK"
          || (transaction.syncError !== null && transaction.syncError !== "amount_mismatch")) {
          continue;
        }

        const payment = findAutomaticPaymentMatch(database, transaction).payment;
        if (!payment) continue;

        const reconciledAt = new Date().toISOString();
        database.update(payments)
          .set({ status: "paid" })
          .where(eq(payments.id, payment.id))
          .run();
        database.update(bankTransactions)
          .set({
            matchedPaymentId: payment.id,
            reconciledUserId: payment.userId,
            reconciledBy: null,
            reconciledAt,
            syncError: null,
          })
          .where(eq(bankTransactions.id, transaction.id))
          .run();
        matched++;
      }

      return { checked: candidates.length, matched };
    });
  }

  // ============ USER WALLETS ============
  getWalletBalance(userId: number): number {
    return db.select().from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .all()
      .reduce((balance, transaction) => balance + transaction.amount, 0);
  }

  getWalletBalances(): Map<number, number> {
    return db.select().from(walletTransactions).all().reduce((balances, transaction) => {
      balances.set(transaction.userId, (balances.get(transaction.userId) ?? 0) + transaction.amount);
      return balances;
    }, new Map<number, number>());
  }

  getWalletTransactionsByUser(userId: number): WalletTransaction[] {
    return db.select().from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt), desc(walletTransactions.id))
      .all();
  }

  createWalletTransaction(transaction: InsertWalletTransaction): WalletTransaction | undefined {
    if (transaction.bankTransactionId) {
      const existing = db.select().from(walletTransactions)
        .where(eq(walletTransactions.bankTransactionId, transaction.bankTransactionId))
        .get();
      if (existing) return undefined;
    }
    if (transaction.paymentId) {
      const existing = db.select().from(walletTransactions)
        .where(eq(walletTransactions.paymentId, transaction.paymentId))
        .get();
      if (existing) return undefined;
    }

    return db.insert(walletTransactions).values(transaction).returning().get();
  }

  // ============ CASHBOX ============
  getAllCashTransactions(): CashTransaction[] {
    return db.select().from(cashTransactions)
      .orderBy(desc(cashTransactions.createdAt), desc(cashTransactions.id))
      .all();
  }

  getCashBalance(): number {
    return this.getAllCashTransactions().reduce(
      (balance, transaction) => balance + (transaction.type === "income" ? transaction.amount : -transaction.amount),
      0,
    );
  }

  createCashTransaction(tx: InsertCashTransaction): CashTransaction {
    return db.insert(cashTransactions).values(tx).returning().get();
  }

  deleteCashTransaction(id: number): boolean {
    return db.delete(cashTransactions).where(eq(cashTransactions.id, id)).run().changes > 0;
  }
}
