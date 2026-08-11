import { storage } from "./storage";
import {
  FIO_SUPPORTED_CURRENCY,
  FioSyncError,
  fioApiResponseSchema,
  normalizeCounterpartyAccount,
  normalizeFioTransaction,
  type FioRawTransaction,
  type NormalizedFioTransaction,
} from "./fio-model";

export {
  FioSyncError,
  fioRawTransactionSchema,
  normalizeCounterpartyAccount,
  normalizeFioTransaction,
} from "./fio-model";

const FIO_API_BASE = "https://fioapi.fio.cz/v1/rest";
const FIO_MIN_INTERVAL_MS = 30_000;
const FIO_INITIAL_LOOKBACK_DAYS = 89;
const FIO_SYNC_OVERLAP_DAYS = 1;
const FIO_ACCOUNT_TIME_ZONE = "Europe/Prague";

interface FioStatementResult {
  transactions: Array<{ normalized: NormalizedFioTransaction; raw: FioRawTransaction }>;
  iban?: string;
  currency?: string;
  closingBalance?: number;
}

async function fetchFioStatement(url: string): Promise<FioStatementResult> {
  enforceFioRateLimit();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
    });
  } catch (error) {
    throw new FioSyncError(
      `Unable to connect to Fio API: ${error instanceof Error ? error.message : "network error"}`,
    );
  }

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
    const statusCode = response.status === 409 ? 429 : 502;
    throw new FioSyncError(
      `Fio API error ${response.status}${detail ? `: ${detail}` : ""}`,
      statusCode,
      response.status === 409 ? 30 : undefined,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new FioSyncError("Fio API returned a response that is not valid JSON");
  }

  const parsed = fioApiResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new FioSyncError(`Fio API returned an unexpected response: ${parsed.error.issues[0]?.message ?? "invalid JSON"}`);
  }

  const statement = parsed.data.accountStatement;
  const rawTransactions = statement.transactionList?.transaction ?? [];
  return {
    transactions: rawTransactions.map(raw => ({ raw, normalized: normalizeFioTransaction(raw) })),
    iban: statement.info.iban,
    currency: statement.info.currency,
    closingBalance: statement.info.closingBalance,
  };
}

function enforceFioRateLimit() {
  const now = Date.now();
  const previousAttempt = Date.parse(storage.getAppSetting("fio_last_api_attempt") ?? "");
  if (Number.isFinite(previousAttempt)) {
    const remainingMs = FIO_MIN_INTERVAL_MS - (now - previousAttempt);
    if (remainingMs > 0) {
      const retryAfterSeconds = Math.ceil(remainingMs / 1000);
      throw new FioSyncError(
        `Fio API can be synchronized again in ${retryAfterSeconds} seconds`,
        429,
        retryAfterSeconds,
      );
    }
  }
  storage.setAppSetting("fio_last_api_attempt", new Date(now).toISOString());
}

function validateDateRange(dateFrom?: string, dateTo?: string) {
  if ((dateFrom && !dateTo) || (!dateFrom && dateTo)) {
    throw new FioSyncError("Both Fio date range values are required", 400);
  }
  if (!dateFrom || !dateTo) return;
  if (!isCalendarDate(dateFrom) || !isCalendarDate(dateTo) || dateFrom > dateTo) {
    throw new FioSyncError("Invalid Fio date range", 400);
  }
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function currentFioDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FIO_ACCOUNT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function getAutomaticFioSyncRange(): { dateFrom: string; dateTo: string } {
  const dateTo = currentFioDate();
  const cursor = storage.getAppSetting("fio_sync_cursor_date");
  const dateFrom = cursor && isCalendarDate(cursor)
    ? addCalendarDays(cursor, -FIO_SYNC_OVERLAP_DAYS)
    : addCalendarDays(dateTo, -FIO_INITIAL_LOOKBACK_DAYS);
  return { dateFrom, dateTo };
}

function recordFioSyncError(message: string, details: Record<string, unknown>) {
  storage.setAppSetting("fio_last_sync_error", message);
  storage.setAppSetting("fio_last_sync_error_data", JSON.stringify({
    occurredAt: new Date().toISOString(),
    ...details,
  }));
  console.error("[Fio sync]", message, details);
}

export async function fetchFioTransactions(token: string, dateFrom: string, dateTo: string) {
  validateDateRange(dateFrom, dateTo);
  const url = `${FIO_API_BASE}/periods/${token}/${dateFrom}/${dateTo}/transactions.json`;
  return (await fetchFioStatement(url)).transactions.map(transaction => transaction.normalized);
}

async function performFioTransactionSync(
  token: string,
  range: { dateFrom: string; dateTo: string },
  automaticSync: boolean,
): Promise<{ synced: number; matched: number; accountBalance?: number }> {
  const statement = await fetchFioStatement(
    `${FIO_API_BASE}/periods/${token}/${range.dateFrom}/${range.dateTo}/transactions.json`,
  );
  const accountCurrency = statement.currency?.trim().toUpperCase();
  if (!accountCurrency || !/^[A-Z]{3}$/.test(accountCurrency)) {
    throw new FioSyncError("Fio statement contains an invalid account currency", 502);
  }

  let synced = 0;
  let matched = 0;
  const rejectedTransactions: Array<{ transactionId: string; currency: string }> = [];

  for (const { normalized, raw } of statement.transactions) {
    const unsupportedCurrency = accountCurrency !== FIO_SUPPORTED_CURRENCY
      || normalized.currency !== FIO_SUPPORTED_CURRENCY;
    const counterparty = normalizeCounterpartyAccount(
      normalized.counterAccount,
      normalized.counterBankCode,
    );
    const memo = normalized.recipientMessage
      ?? normalized.userIdentification
      ?? normalized.comment
      ?? normalized.payerReference
      ?? normalized.specification;
    const result = storage.importBankTransaction({
      transactionId: normalized.transactionId,
      amount: normalized.amountMinor,
      currency: normalized.currency,
      date: normalized.date,
      payerName: normalized.counterName ?? normalized.userIdentification,
      payerAccount: counterparty.account,
      payerBankCode: counterparty.bankCode,
      payerIban: counterparty.iban,
      variableSymbol: normalized.variableSymbol,
      constantSymbol: normalized.constantSymbol,
      memo,
      syncError: unsupportedCurrency ? "unsupported_currency" : null,
      rawData: JSON.stringify({ normalized, raw }),
      matchedPaymentId: null,
      syncedAt: new Date().toISOString(),
    });
    if (result.created) synced++;
    if (result.matched) matched++;
    if (unsupportedCurrency) {
      rejectedTransactions.push({
        transactionId: normalized.transactionId,
        currency: normalized.currency,
      });
    }
  }

  if (accountCurrency === FIO_SUPPORTED_CURRENCY) {
    if (statement.iban) storage.setAppSetting("payment_iban", statement.iban);
    storage.setAppSetting("payment_currency", FIO_SUPPORTED_CURRENCY);
    if (typeof statement.closingBalance === "number" && Number.isFinite(statement.closingBalance)) {
      storage.setAppSetting("fio_account_balance", String(statement.closingBalance));
      storage.setAppSetting("fio_balance_updated_at", new Date().toISOString());
    }
    if (automaticSync) storage.setAppSetting("fio_sync_cursor_date", range.dateTo);
  }

  if (accountCurrency !== FIO_SUPPORTED_CURRENCY) {
    const message = `Fio account currency ${accountCurrency} is not supported; only CZK accounts can be synchronized`;
    throw new FioSyncError(message, 422);
  }

  if (rejectedTransactions.length > 0) {
    const currencies = Array.from(new Set(
      rejectedTransactions.map(transaction => transaction.currency),
    )).join(", ");
    const message = `${rejectedTransactions.length} non-CZK Fio transaction(s) were logged but rejected (${currencies})`;
    throw new FioSyncError(message, 422);
  }

  storage.setAppSetting("fio_last_sync", new Date().toISOString());
  storage.setAppSetting("fio_last_sync_error", "");
  storage.setAppSetting("fio_last_sync_error_data", "");
  return { synced, matched, accountBalance: statement.closingBalance };
}

export async function syncFioTransactions(
  token: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<{ synced: number; matched: number; accountBalance?: number }> {
  // Invalid admin input is a request error, not a failed Fio synchronization.
  validateDateRange(dateFrom, dateTo);

  const automaticSync = !dateFrom && !dateTo;
  const range = automaticSync
    ? getAutomaticFioSyncRange()
    : { dateFrom: dateFrom!, dateTo: dateTo! };

  try {
    return await performFioTransactionSync(token, range, automaticSync);
  } catch (error) {
    const syncError = error instanceof FioSyncError
      ? error
      : new FioSyncError("Fio synchronization failed while processing transactions");

    recordFioSyncError(syncError.message, {
      automaticSync,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      statusCode: syncError.statusCode,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    if (!(error instanceof FioSyncError)) {
      console.error("[Fio sync] Unexpected synchronization error", error);
    }
    throw syncError;
  }
}

export function setLastSyncDate(date: string) {
  storage.setAppSetting("fio_last_sync", date);
}

export function getLastSyncDate(): string | undefined {
  return storage.getAppSetting("fio_last_sync");
}
