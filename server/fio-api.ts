import { z } from "zod";
import { storage } from "./storage";

const FIO_API_BASE = "https://fioapi.fio.cz/v1/rest";
const FIO_MIN_INTERVAL_MS = 30_000;

const columnMetadata = {
  name: z.string().optional(),
  id: z.number().int().optional(),
};

const numberColumnSchema = z.object({
  value: z.number().finite(),
  ...columnMetadata,
});

const textColumnSchema = z.object({
  value: z.union([z.string(), z.number().finite()]),
  ...columnMetadata,
});

const optionalTextColumnSchema = textColumnSchema.nullable().optional();

// Fio's JSON response uses stable column IDs instead of descriptive property
// names. Keep this raw model separate from the normalized application model.
export const fioRawTransactionSchema = z.object({
  column22: numberColumnSchema, // ID pohybu
  column0: z.object({ value: z.union([z.number().finite(), z.string()]), ...columnMetadata }), // Datum
  column1: numberColumnSchema, // Objem
  column14: textColumnSchema, // Měna
  column2: optionalTextColumnSchema, // Protiúčet
  column10: optionalTextColumnSchema, // Název protiúčtu
  column3: optionalTextColumnSchema, // Kód banky
  column12: optionalTextColumnSchema, // Název banky
  column4: optionalTextColumnSchema, // KS
  column5: optionalTextColumnSchema, // VS
  column6: optionalTextColumnSchema, // SS
  column7: optionalTextColumnSchema, // Uživatelská identifikace
  column16: optionalTextColumnSchema, // Zpráva pro příjemce
  column8: optionalTextColumnSchema, // Typ
  column9: optionalTextColumnSchema, // Provedl
  column18: optionalTextColumnSchema, // Upřesnění
  column25: optionalTextColumnSchema, // Komentář
  column26: optionalTextColumnSchema, // BIC
  column17: optionalTextColumnSchema, // ID pokynu
  column27: optionalTextColumnSchema, // Reference plátce
}).passthrough();

export type FioRawTransaction = z.infer<typeof fioRawTransactionSchema>;

const fioApiResponseSchema = z.object({
  accountStatement: z.object({
    info: z.object({
      accountId: z.union([z.string(), z.number()]).optional(),
      iban: z.string().optional(),
      currency: z.string().optional(),
      openingBalance: z.number().finite().optional(),
      closingBalance: z.number().finite().optional(),
      dateStart: z.union([z.string(), z.number()]).optional(),
      dateEnd: z.union([z.string(), z.number()]).optional(),
      idFrom: z.number().optional().nullable(),
      idTo: z.number().optional().nullable(),
      idLastDownload: z.number().optional().nullable(),
    }).passthrough(),
    transactionList: z.object({
      transaction: z.array(fioRawTransactionSchema).optional().nullable(),
    }).optional().nullable(),
  }).passthrough(),
});

export interface NormalizedFioTransaction {
  transactionId: string;
  instructionId: string | null;
  date: string;
  amountMinor: number;
  currency: string;
  counterAccount: string | null;
  counterBankCode: string | null;
  counterName: string | null;
  counterBankName: string | null;
  constantSymbol: string | null;
  variableSymbol: string | null;
  specificSymbol: string | null;
  userIdentification: string | null;
  recipientMessage: string | null;
  transactionType: string | null;
  performedBy: string | null;
  specification: string | null;
  comment: string | null;
  bic: string | null;
  payerReference: string | null;
}

interface FioStatementResult {
  transactions: Array<{ normalized: NormalizedFioTransaction; raw: FioRawTransaction }>;
  iban?: string;
  currency?: string;
  closingBalance?: number;
}

export class FioSyncError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "FioSyncError";
  }
}

function columnText(column: z.infer<typeof optionalTextColumnSchema>): string | null {
  if (!column || column.value === null || column.value === undefined) return null;
  const value = String(column.value).trim();
  return value || null;
}

function normalizeSymbol(value: string | null, label: string): string | null {
  if (!value) return null;
  if (!/^\d{1,10}$/.test(value)) {
    throw new FioSyncError(`Fio transaction contains an invalid ${label}`, 502);
  }
  return value.replace(/^0+(?=\d)/, "");
}

export function normalizeFioTransaction(raw: FioRawTransaction): NormalizedFioTransaction {
  const transactionIdValue = raw.column22.value;
  if (!Number.isSafeInteger(transactionIdValue) || transactionIdValue <= 0) {
    throw new FioSyncError("Fio transaction contains an invalid transaction ID", 502);
  }

  const date = new Date(raw.column0.value);
  if (Number.isNaN(date.getTime())) {
    throw new FioSyncError(`Fio transaction ${transactionIdValue} contains an invalid date`, 502);
  }

  const amountInMinorUnits = raw.column1.value * 100;
  const amountMinor = Math.round(amountInMinorUnits);
  if (!Number.isSafeInteger(amountMinor) || Math.abs(amountInMinorUnits - amountMinor) > 0.000001) {
    throw new FioSyncError(`Fio transaction ${transactionIdValue} has unsupported monetary precision`, 502);
  }

  const currency = columnText(raw.column14)?.toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new FioSyncError(`Fio transaction ${transactionIdValue} contains an invalid currency`, 502);
  }

  return {
    transactionId: String(transactionIdValue),
    instructionId: columnText(raw.column17),
    date: date.toISOString(),
    amountMinor,
    currency,
    counterAccount: columnText(raw.column2),
    counterBankCode: columnText(raw.column3),
    counterName: columnText(raw.column10),
    counterBankName: columnText(raw.column12),
    constantSymbol: normalizeSymbol(columnText(raw.column4), "constant symbol"),
    variableSymbol: normalizeSymbol(columnText(raw.column5), "variable symbol"),
    specificSymbol: normalizeSymbol(columnText(raw.column6), "specific symbol"),
    userIdentification: columnText(raw.column7),
    recipientMessage: columnText(raw.column16),
    transactionType: columnText(raw.column8),
    performedBy: columnText(raw.column9),
    specification: columnText(raw.column18),
    comment: columnText(raw.column25),
    bic: columnText(raw.column26),
    payerReference: columnText(raw.column27),
  };
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) {
    throw new FioSyncError("Invalid Fio date range", 400);
  }
}

export async function fetchFioTransactions(token: string, dateFrom: string, dateTo: string) {
  validateDateRange(dateFrom, dateTo);
  const url = `${FIO_API_BASE}/periods/${token}/${dateFrom}/${dateTo}/transactions.json`;
  return (await fetchFioStatement(url)).transactions.map(transaction => transaction.normalized);
}

export async function fetchLatestFioTransactions(token: string) {
  const url = `${FIO_API_BASE}/last/${token}/transactions.json`;
  return (await fetchFioStatement(url)).transactions.map(transaction => transaction.normalized);
}

export async function syncFioTransactions(
  token: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<{ synced: number; matched: number; accountBalance?: number }> {
  validateDateRange(dateFrom, dateTo);

  const statement = dateFrom && dateTo
    ? await fetchFioStatement(`${FIO_API_BASE}/periods/${token}/${dateFrom}/${dateTo}/transactions.json`)
    : await fetchFioStatement(`${FIO_API_BASE}/last/${token}/transactions.json`);

  if (statement.iban) storage.setAppSetting("payment_iban", statement.iban);
  if (statement.currency) storage.setAppSetting("payment_currency", statement.currency.toUpperCase());
  if (typeof statement.closingBalance === "number" && Number.isFinite(statement.closingBalance)) {
    storage.setAppSetting("fio_account_balance", String(statement.closingBalance));
    storage.setAppSetting("fio_balance_updated_at", new Date().toISOString());
  }

  let synced = 0;
  let matched = 0;

  for (const { normalized, raw } of statement.transactions) {
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
      payerIban: normalized.counterAccount,
      variableSymbol: normalized.variableSymbol,
      constantSymbol: normalized.constantSymbol,
      memo,
      syncError: normalized.currency === "CZK" ? null : "unsupported_currency",
      rawData: JSON.stringify({ normalized, raw }),
      matchedPaymentId: null,
      syncedAt: new Date().toISOString(),
    });
    if (result.created) synced++;
    if (result.matched) matched++;
  }

  return { synced, matched, accountBalance: statement.closingBalance };
}

export function setLastSyncDate(date: string) {
  storage.setAppSetting("fio_last_sync", date);
}

export function getLastSyncDate(): string | undefined {
  return storage.getAppSetting("fio_last_sync");
}
