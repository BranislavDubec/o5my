import { z } from "zod";

export const FIO_SUPPORTED_CURRENCY = "CZK";

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
  column14: textColumnSchema, // Mena
  column2: optionalTextColumnSchema, // Protiucet
  column10: optionalTextColumnSchema, // Nazev protiuctu
  column3: optionalTextColumnSchema, // Kod banky
  column12: optionalTextColumnSchema, // Nazev banky
  column4: optionalTextColumnSchema, // KS
  column5: optionalTextColumnSchema, // VS
  column6: optionalTextColumnSchema, // SS
  column7: optionalTextColumnSchema, // Uzivatelska identifikace
  column16: optionalTextColumnSchema, // Zprava pro prijemce
  column8: optionalTextColumnSchema, // Typ
  column9: optionalTextColumnSchema, // Provedl
  column18: optionalTextColumnSchema, // Upresneni
  column25: optionalTextColumnSchema, // Komentar
  column26: optionalTextColumnSchema, // BIC
  column17: optionalTextColumnSchema, // ID pokynu
  column27: optionalTextColumnSchema, // Reference platce
}).passthrough();

export type FioRawTransaction = z.infer<typeof fioRawTransactionSchema>;

export const fioApiResponseSchema = z.object({
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

export interface CounterpartyAccount {
  account: string | null;
  bankCode: string | null;
  iban: string | null;
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

function validateSymbol(value: string | null, label: string, maxLength: number): string | null {
  if (!value) return null;
  if (!new RegExp(`^\\d{1,${maxLength}}$`).test(value)) {
    throw new FioSyncError(`Fio transaction contains an invalid ${label}`, 502);
  }
  return value;
}

function modulo97(value: string): number {
  let remainder = 0;
  for (const character of value) {
    remainder = (remainder * 10 + Number(character)) % 97;
  }
  return remainder;
}

function isValidIban(value: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;
  const rearranged = `${value.slice(4)}${value.slice(0, 4)}`
    .replace(/[A-Z]/g, character => String(character.charCodeAt(0) - 55));
  return modulo97(rearranged) === 1;
}

function createCzechIban(account: string, bankCode: string): string | null {
  const match = /^(?:(\d{1,6})-)?(\d{1,10})$/.exec(account);
  if (!match || !/^\d{4}$/.test(bankCode)) return null;

  const prefix = (match[1] ?? "").padStart(6, "0");
  const accountNumber = match[2].padStart(10, "0");
  const bban = `${bankCode}${prefix}${accountNumber}`;
  const checkDigits = String(98 - modulo97(`${bban}123500`)).padStart(2, "0");
  return `CZ${checkDigits}${bban}`;
}

export function normalizeCounterpartyAccount(
  counterAccount: string | null,
  counterBankCode: string | null,
): CounterpartyAccount {
  if (!counterAccount) {
    return { account: null, bankCode: counterBankCode, iban: null };
  }

  const compactAccount = counterAccount.replace(/\s+/g, "").toUpperCase();
  const compactIban = compactAccount.replace(/[^A-Z0-9]/g, "");
  if (isValidIban(compactIban)) {
    return { account: counterAccount, bankCode: counterBankCode, iban: compactIban };
  }

  const slashMatch = /^(.*)\/(\d{4})$/.exec(compactAccount);
  const account = slashMatch?.[1] ?? compactAccount;
  const bankCode = counterBankCode ?? slashMatch?.[2] ?? null;
  return {
    account,
    bankCode,
    iban: bankCode ? createCzechIban(account, bankCode) : null,
  };
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

  const currency = columnText(raw.column14)?.toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new FioSyncError(`Fio transaction ${transactionIdValue} contains an invalid currency`, 502);
  }

  const amountInMinorUnits = raw.column1.value * 100;
  const amountMinor = Math.round(amountInMinorUnits);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new FioSyncError(`Fio transaction ${transactionIdValue} contains an invalid amount`, 502);
  }
  if (currency === FIO_SUPPORTED_CURRENCY && Math.abs(amountInMinorUnits - amountMinor) > 0.000001) {
    throw new FioSyncError(`Fio transaction ${transactionIdValue} has unsupported CZK monetary precision`, 502);
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
    constantSymbol: validateSymbol(columnText(raw.column4), "constant symbol", 4),
    variableSymbol: validateSymbol(columnText(raw.column5), "variable symbol", 10),
    specificSymbol: validateSymbol(columnText(raw.column6), "specific symbol", 10),
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
