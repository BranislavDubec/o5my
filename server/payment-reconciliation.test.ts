import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";

test("bank reconciliation is atomic, precise, idempotent, and retryable", async () => {
  const testDirectory = mkdtempSync(join(tmpdir(), "o5my-bank-reconciliation-"));
  process.env.DATABASE_PATH = join(testDirectory, "test.db");

  const importedModules = await Promise.all([
    import("./storage/db"),
    import("../shared/schema"),
    import("./storage/payments"),
  ]).catch(error => {
    delete process.env.DATABASE_PATH;
    rmSync(testDirectory, { recursive: true, force: true });
    throw error;
  });
  const [{ db, sqlite }, schema, paymentsModule] = importedModules;
  const { users, payments, bankTransactions, walletTransactions } = schema;
  const { BankReconciliationError, PaymentsStore } = paymentsModule;
  const store = new PaymentsStore();
  let sequence = 0;

  const createUser = (name: string, isActive = true) => db.insert(users).values({
    email: `${name.toLowerCase()}-${++sequence}@example.test`,
    password: "test-password-hash",
    name,
    role: "player",
    isActive,
    emailVerified: true,
  }).returning().get();

  const createPayment = (userId: number, amount = 1_000) => store.createPayment({
    userId,
    amount,
    fullPrice: amount,
    identity: "Integration test",
    dueDate: "2026-12-31",
    variableSymbol: null,
    description: "Integration test payment",
    status: "pending",
  });

  const createBankTransaction = (
    amount: number,
    options: { variableSymbol?: string | null; syncError?: string | null } = {},
  ) => db.insert(bankTransactions).values({
    transactionId: `bank-test-${++sequence}`,
    amount,
    currency: "CZK",
    date: "2026-08-17T10:00:00.000Z",
    payerName: "Integration test payer",
    payerAccount: "1234567890",
    payerBankCode: "2010",
    payerIban: "CZ0000000000000000000000",
    variableSymbol: options.variableSymbol ?? null,
    constantSymbol: null,
    memo: null,
    syncError: options.syncError ?? null,
    rawData: "{}",
    matchedPaymentId: null,
    syncedAt: "2026-08-17T10:01:00.000Z",
  }).returning().get();

  const expectReconciliationError = (
    operation: () => unknown,
    expectedCode: string,
  ) => assert.throws(operation, (error: unknown) => (
    error instanceof BankReconciliationError
    && error.code === expectedCode
  ));

  try {
    const actor = db.insert(users).values({
      email: "admin@example.test",
      password: "test-password-hash",
      name: "Admin",
      role: "admin",
      isActive: true,
      emailVerified: true,
    }).returning().get();

    const exactUser = createUser("Exact");
    const exactPayment = createPayment(exactUser.id);
    const exactBankTransaction = createBankTransaction(100_000);
    const exact = store.reconcileBankTransaction({
      bankTransactionId: exactBankTransaction.id,
      userId: exactUser.id,
      paymentId: exactPayment.id,
      actorId: actor.id,
    });
    assert.equal(exact.payment?.status, "paid");
    assert.equal(exact.walletCredit, 0);
    assert.equal(exact.transaction.matchedPaymentId, exactPayment.id);
    assert.equal(exact.transaction.reconciledUserId, exactUser.id);
    assert.equal(exact.transaction.reconciledBy, actor.id);
    assert.ok(exact.transaction.reconciledAt);
    assert.equal(store.getWalletBalance(exactUser.id), 0);
    expectReconciliationError(
      () => store.updatePaymentStatus(exactPayment.id, "pending"),
      "PAYMENT_RECONCILED",
    );
    assert.equal(store.getPayment(exactPayment.id)?.status, "paid");
    expectReconciliationError(
      () => store.deletePayment(exactPayment.id),
      "PAYMENT_RECONCILED",
    );
    assert.ok(store.getPayment(exactPayment.id));
    expectReconciliationError(() => store.reconcileBankTransaction({
      bankTransactionId: exactBankTransaction.id,
      userId: exactUser.id,
      paymentId: exactPayment.id,
      actorId: actor.id,
    }), "TRANSACTION_ALREADY_RECONCILED");

    const overpaymentUser = createUser("Overpayment");
    const overpayment = createPayment(overpaymentUser.id);
    const overpaymentBankTransaction = createBankTransaction(120_000);
    const overpaymentResult = store.reconcileBankTransaction({
      bankTransactionId: overpaymentBankTransaction.id,
      userId: overpaymentUser.id,
      paymentId: overpayment.id,
      actorId: actor.id,
    });
    assert.equal(overpaymentResult.payment?.status, "paid");
    assert.equal(overpaymentResult.walletCredit, 200);
    assert.equal(store.getWalletBalance(overpaymentUser.id), 200);
    const overpaymentLedgerEntry = db.select().from(walletTransactions).all()
      .find(entry => entry.bankTransactionId === overpaymentBankTransaction.id);
    assert.equal(overpaymentLedgerEntry?.userId, overpaymentUser.id);
    assert.equal(overpaymentLedgerEntry?.amount, 200);

    const walletUser = createUser("Wallet");
    const walletBankTransaction = createBankTransaction(50_000);
    const walletResult = store.reconcileBankTransaction({
      bankTransactionId: walletBankTransaction.id,
      userId: walletUser.id,
      actorId: actor.id,
    });
    assert.equal(walletResult.payment, null);
    assert.equal(walletResult.walletCredit, 500);
    assert.equal(walletResult.transaction.matchedPaymentId, null);
    assert.equal(store.getWalletBalance(walletUser.id), 500);

    const rejectedUser = createUser("Rejected");
    const underpaidPayment = createPayment(rejectedUser.id);
    const underpaidBankTransaction = createBankTransaction(99_900);
    expectReconciliationError(() => store.reconcileBankTransaction({
      bankTransactionId: underpaidBankTransaction.id,
      userId: rejectedUser.id,
      paymentId: underpaidPayment.id,
      actorId: actor.id,
    }), "UNDERPAYMENT");
    assert.equal(store.getPayment(underpaidPayment.id)?.status, "pending");
    assert.equal(
      db.select().from(bankTransactions).all().find(row => row.id === underpaidBankTransaction.id)?.reconciledAt,
      null,
    );

    const fractionalPayment = createPayment(rejectedUser.id);
    const fractionalBankTransaction = createBankTransaction(100_050);
    expectReconciliationError(() => store.reconcileBankTransaction({
      bankTransactionId: fractionalBankTransaction.id,
      userId: rejectedUser.id,
      paymentId: fractionalPayment.id,
      actorId: actor.id,
    }), "FRACTIONAL_WALLET_CREDIT");
    assert.equal(store.getPayment(fractionalPayment.id)?.status, "pending");
    assert.equal(store.getWalletBalance(rejectedUser.id), 0);
    assert.equal(
      db.select().from(bankTransactions).all().find(row => row.id === fractionalBankTransaction.id)?.reconciledAt,
      null,
    );

    const retryUser = createUser("Retry");
    const retryPayment = createPayment(retryUser.id);
    const retryBankTransaction = createBankTransaction(100_000, {
      variableSymbol: retryPayment.variableSymbol,
      syncError: "amount_mismatch",
    });
    const retryResult = store.retryUnmatchedBankTransactions();
    assert.equal(retryResult.matched, 1);
    assert.equal(store.getPayment(retryPayment.id)?.status, "paid");
    const persistedRetriedTransaction = db.select().from(bankTransactions).all()
      .find(row => row.id === retryBankTransaction.id);
    assert.equal(persistedRetriedTransaction?.matchedPaymentId, retryPayment.id);
    assert.equal(persistedRetriedTransaction?.reconciledUserId, retryUser.id);
    assert.equal(persistedRetriedTransaction?.syncError, null);
    assert.ok(persistedRetriedTransaction?.reconciledAt);

    const automaticUser = createUser("Automatic");
    const automaticPayment = createPayment(automaticUser.id);
    const automaticResult = store.importBankTransaction({
      transactionId: `bank-test-${++sequence}`,
      amount: 100_000,
      currency: "CZK",
      date: "2026-08-17T11:00:00.000Z",
      payerName: "Automatic payer",
      payerAccount: "1234567890",
      payerBankCode: "2010",
      payerIban: "CZ0000000000000000000000",
      variableSymbol: automaticPayment.variableSymbol,
      constantSymbol: null,
      memo: null,
      syncError: null,
      rawData: "{}",
      matchedPaymentId: null,
      syncedAt: "2026-08-17T11:01:00.000Z",
    });
    assert.equal(automaticResult.matched, true);
    assert.equal(automaticResult.transaction.reconciledUserId, automaticUser.id);
    assert.equal(automaticResult.transaction.reconciledBy, null);
    assert.ok(automaticResult.transaction.reconciledAt);

    db.update(payments).set({ status: "pending" }).where(eq(payments.id, automaticPayment.id)).run();
    const duplicateAutomaticResult = store.importBankTransaction({
      transactionId: `bank-test-${++sequence}`,
      amount: 100_000,
      currency: "CZK",
      date: "2026-08-17T11:05:00.000Z",
      payerName: "Duplicate automatic payer",
      payerAccount: "1234567890",
      payerBankCode: "2010",
      payerIban: "CZ0000000000000000000000",
      variableSymbol: automaticPayment.variableSymbol,
      constantSymbol: null,
      memo: null,
      syncError: null,
      rawData: "{}",
      matchedPaymentId: null,
      syncedAt: "2026-08-17T11:06:00.000Z",
    });
    assert.equal(duplicateAutomaticResult.matched, false);
    assert.equal(duplicateAutomaticResult.transaction.matchedPaymentId, null);
    db.update(payments).set({ status: "paid" }).where(eq(payments.id, automaticPayment.id)).run();

    assert.equal(db.select().from(payments).all().filter(payment => payment.status === "paid").length, 4);
  } finally {
    sqlite.close();
    delete process.env.DATABASE_PATH;
    rmSync(testDirectory, { recursive: true, force: true });
  }
});
