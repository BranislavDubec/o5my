import { storage } from './storage';

const FIO_API_BASE = 'https://fioapi.fio.cz/v1/rest';

interface FioTransaction {
  id: number; // IDpohyb
  date: string; // Datum
  amount: number; // Objem
  currency: string; // Mena
  counteraccount: string; // Protiucet
  countername: string; // Nazev protiuctu
  counteriban: string; // IBAN
  variablesymbol: string; // Variabilní symbol
  constantsymbol: string; // Konstantní symbol
  memo: string; // Poznámka
  useridentification: string; // Uživatelská identifikace
}

interface FioApiResponse {
  accountStatement: {
    info: {
      accountid: string;
      iban: string;
      currency: string;
      openingBalance: number;
      closingBalance: number;
      dateStart: string;
      dateEnd: string;
      idFrom: number;
      idTo: number;
    };
    transactionList: {
      transaction: FioTransaction[];
    };
  };
}

interface FioStatementResult {
  transactions: FioTransaction[];
  iban?: string;
  currency?: string;
  closingBalance?: number;
}

async function fetchFioStatement(url: string): Promise<FioStatementResult> {
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FIO API error: ${response.status} ${text}`);
  }

  const data: FioApiResponse = await response.json();
  return {
    transactions: data.accountStatement?.transactionList?.transaction || [],
    iban: data.accountStatement?.info?.iban,
    currency: data.accountStatement?.info?.currency,
    closingBalance: data.accountStatement?.info?.closingBalance,
  };
}

/**
 * Fetch transactions from FIO bank API for a date range.
 * Uses the v1 REST API with token authentication.
 * @see https://www.fio.cz/docs/cz/API_Bankovnictvi.pdf
 */
export async function fetchFioTransactions(
  token: string,
  dateFrom: string,
  dateTo: string
): Promise<FioTransaction[]> {
  const url = `${FIO_API_BASE}/periods/${token}/${dateFrom}/${dateTo}/transactions.json`;
  return (await fetchFioStatement(url)).transactions;
}

/**
 * Fetch latest transactions since last download.
 * Uses the /last endpoint which returns transactions since the last API call.
 */
export async function fetchLatestFioTransactions(token: string): Promise<FioTransaction[]> {
  const url = `${FIO_API_BASE}/last/${token}/transactions.json`;
  return (await fetchFioStatement(url)).transactions;
}

/**
 * Sync transactions from FIO bank into the database.
 * Optionally auto-match transactions to pending payments by variable symbol.
 */
export async function syncFioTransactions(
  token: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ synced: number; matched: number; accountBalance?: number }> {
  let statement: FioStatementResult;

  if (dateFrom && dateTo) {
    statement = await fetchFioStatement(
      `${FIO_API_BASE}/periods/${token}/${dateFrom}/${dateTo}/transactions.json`,
    );
  } else {
    statement = await fetchFioStatement(`${FIO_API_BASE}/last/${token}/transactions.json`);
  }

  if (statement.iban) storage.setAppSetting('payment_iban', statement.iban);
  if (statement.currency) storage.setAppSetting('payment_currency', statement.currency.toUpperCase());
  if (typeof statement.closingBalance === 'number' && Number.isFinite(statement.closingBalance)) {
    storage.setAppSetting('fio_account_balance', String(statement.closingBalance));
    storage.setAppSetting('fio_balance_updated_at', new Date().toISOString());
  }

  let synced = 0;
  let matched = 0;

  for (const tx of statement.transactions) {
    // Only process incoming payments (positive amounts)
    if (tx.amount <= 0) continue;

    const created = storage.createBankTransaction({
      transactionId: String(tx.id),
      amount: Math.round(tx.amount),
      date: tx.date,
      payerName: tx.countername || tx.useridentification || null,
      payerIban: tx.counteriban || null,
      variableSymbol: tx.variablesymbol || null,
      constantSymbol: tx.constantsymbol || null,
      memo: tx.memo || tx.useridentification || null,
      matchedPaymentId: null,
      syncedAt: new Date().toISOString(),
    });

    if (created) {
      synced++;

      // Try to auto-match by variable symbol
      if (created.variableSymbol) {
        const pendingPayments = storage.getPendingPaymentsByVariableSymbol(created.variableSymbol);
        if (pendingPayments.length > 0) {
          const payment = pendingPayments[0];
          storage.updateBankTransactionMatch(created.id, payment.id);
          storage.updatePaymentStatus(payment.id, 'paid');
          matched++;
        }
      }
    }
  }

  return { synced, matched, accountBalance: statement.closingBalance };
}

/**
 * Set the last sync pointer so we don't re-download old transactions.
 * FIO API /last endpoint moves the pointer automatically.
 */
export function setLastSyncDate(date: string) {
  storage.setAppSetting('fio_last_sync', date);
}

export function getLastSyncDate(): string | undefined {
  return storage.getAppSetting('fio_last_sync');
}
