import { eq } from "drizzle-orm";
import {
  playerStatistics,
  matchResults,
  matchPlayerStatistics,
  payments,
  walletTransactions,
} from '@shared/schema';
import type {
  PlayerStatistic,
  MatchResult,
  MatchPlayerStatistic,
  Payment,
  InsertPayment,
  WalletTransaction,
  InsertEvent,
} from '@shared/schema';

function normalizeEventTime(value?: string | null) {
  if (!value) return value ?? null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

function normalizeEventData(event: Partial<InsertEvent>) {
  const normalized: Partial<InsertEvent> = { ...event };
  if (typeof normalized.startTime === "string") {
    normalized.startTime = normalizeEventTime(normalized.startTime) as string;
  }
  if (typeof normalized.endTime === "string") {
    normalized.endTime = normalizeEventTime(normalized.endTime) as string;
  }
  return normalized;
}

function applyPlayerStatisticDelta(
  tx: any,
  userId: number,
  goalsDelta: number,
  assistsDelta: number,
  updatedAt: string,
) {
  if (goalsDelta === 0 && assistsDelta === 0) return;
  const existing = tx.select().from(playerStatistics).where(eq(playerStatistics.userId, userId)).get() as PlayerStatistic | undefined;
  const goals = (existing?.goals ?? 0) + goalsDelta;
  const assists = (existing?.assists ?? 0) + assistsDelta;
  if (goals < 0 || assists < 0) {
    throw new Error("Celková štatistika hráča nemôže byť nižšia ako príspevky zo zápasov");
  }
  if (goals > 10_000 || assists > 10_000) {
    throw new Error("Štatistika hráča je príliš vysoká");
  }
  if (existing) {
    tx.update(playerStatistics)
      .set({ goals, assists, updatedAt })
      .where(eq(playerStatistics.id, existing.id))
      .run();
  } else {
    tx.insert(playerStatistics).values({ userId, goals, assists, updatedAt }).run();
  }
}

function deleteMatchResultInTransaction(tx: any, eventId: number): boolean {
  const result = tx.select().from(matchResults).where(eq(matchResults.eventId, eventId)).get() as MatchResult | undefined;
  if (!result) return false;
  const contributions = tx.select().from(matchPlayerStatistics)
    .where(eq(matchPlayerStatistics.eventId, eventId))
    .all() as MatchPlayerStatistic[];
  const updatedAt = new Date().toISOString();
  contributions.forEach(contribution => {
    applyPlayerStatisticDelta(tx, contribution.userId, -contribution.goals, -contribution.assists, updatedAt);
  });
  tx.delete(matchPlayerStatistics).where(eq(matchPlayerStatistics.eventId, eventId)).run();
  tx.delete(matchResults).where(eq(matchResults.eventId, eventId)).run();
  return true;
}

function createPaymentWithWalletInTransaction(tx: any, payment: InsertPayment): Payment {
  if (!Number.isInteger(payment.amount) || payment.amount <= 0) {
    throw new Error("Suma musí byť kladné celé číslo");
  }
  const fullPrice = typeof payment.fullPrice === "number" && payment.fullPrice > 0
    ? payment.fullPrice
    : payment.amount;
  if (fullPrice < payment.amount) {
    throw new Error("Celková suma nemôže byť menšia ako suma jednej platby");
  }

  const walletBalance = (tx.select().from(walletTransactions)
    .where(eq(walletTransactions.userId, payment.userId))
    .all() as WalletTransaction[])
    .reduce((balance, transaction) => balance + transaction.amount, 0);
  const walletAppliedAmount = Math.min(Math.max(walletBalance, 0), payment.amount);
  const status = walletAppliedAmount === payment.amount ? "paid" : "pending";

  const created = tx.insert(payments)
    .values({
      ...payment,
      fullPrice,
      variableSymbol: null,
      walletAppliedAmount,
      status,
    })
    .returning()
    .get() as Payment;

  if (walletAppliedAmount > 0) {
    tx.insert(walletTransactions).values({
      userId: payment.userId,
      bankTransactionId: null,
      paymentId: created.id,
      amount: -walletAppliedAmount,
      description: `Platba #${created.id}: ${payment.description}`,
    }).run();
  }

  return tx.update(payments)
    .set({ variableSymbol: String(created.id) })
    .where(eq(payments.id, created.id))
    .returning()
    .get() as Payment;
}

export { normalizeEventTime, normalizeEventData, applyPlayerStatisticDelta, deleteMatchResultInTransaction, createPaymentWithWalletInTransaction };
