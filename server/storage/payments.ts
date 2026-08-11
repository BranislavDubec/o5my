import { eq, and, desc, ne } from "drizzle-orm";
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
    return db.update(payments)
      .set({ status })
      .where(eq(payments.id, id))
      .returning()
      .get();
  }

  deletePayment(id: number): void {
    db.transaction(tx => {
      tx.update(bankTransactions)
        .set({ matchedPaymentId: null })
        .where(eq(bankTransactions.matchedPaymentId, id))
        .run();
      tx.delete(walletTransactions)
        .where(eq(walletTransactions.paymentId, id))
        .run();
      tx.delete(payments).where(eq(payments.id, id)).run();
    });
  }

  getPendingPaymentsByVariableSymbol(vs: string): Payment[] {
    return db.select().from(payments)
      .where(and(eq(payments.variableSymbol, vs), eq(payments.status, "pending")))
      .all();
  }

  // ============ BANK TRANSACTIONS ============
  getAllBankTransactions(limit = 50): BankTransaction[] {
    return db.select().from(bankTransactions)
      .orderBy(desc(bankTransactions.date))
      .limit(limit)
      .all();
  }

  getUnmatchedBankTransactions(): BankTransaction[] {
    return db.select().from(bankTransactions)
      .all()
      .filter(tx => tx.matchedPaymentId === null);
  }

  importBankTransaction(tx: Omit<BankTransaction, 'id'>): {
    transaction: BankTransaction;
    created: boolean;
    matched: boolean;
  } {
    return db.transaction(database => {
      const existing = database.select().from(bankTransactions)
        .where(eq(bankTransactions.transactionId, tx.transactionId))
        .get();
      if (existing) return { transaction: existing, created: false, matched: false };

      let matchedPaymentId: number | null = null;
      let syncError = tx.syncError;

      if (!syncError && tx.amount > 0 && tx.currency === "CZK" && tx.variableSymbol) {
        const pendingPayment = database.select().from(payments)
          .where(and(
            eq(payments.variableSymbol, tx.variableSymbol),
            ne(payments.status, "paid"),
          ))
          .get();

        if (pendingPayment) {
          const outstandingMinor = Math.max(
            0,
            pendingPayment.amount - pendingPayment.walletAppliedAmount,
          ) * 100;
          if (tx.amount === outstandingMinor) {
            matchedPaymentId = pendingPayment.id;
          } else {
            syncError = "amount_mismatch";
          }
        }
      }

      const transaction = database.insert(bankTransactions).values({
        ...tx,
        matchedPaymentId,
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

  updateBankTransactionMatch(id: number, paymentId: number | null): void {
    db.update(bankTransactions)
      .set({ matchedPaymentId: paymentId })
      .where(eq(bankTransactions.id, id))
      .run();
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
