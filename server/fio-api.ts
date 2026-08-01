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
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FIO API error: ${response.status} ${text}`);
  }

  const data: FioApiResponse = await response.json();
  return data.accountStatement?.transactionList?.transaction || [];
}

/**
 * Fetch latest transactions since last download.
 * Uses the /last endpoint which returns transactions since the last API call.
 */
export async function fetchLatestFioTransactions(token: string): Promise<FioTransaction[]> {
  const url = `${FIO_API_BASE}/last/${token}/transactions.json`;
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FIO API error: ${response.status} ${text}`);
  }

  const data: FioApiResponse = await response.json();
  return data.accountStatement?.transactionList?.transaction || [];
}

/**
 * Sync transactions from FIO bank into the database.
 * Optionally auto-match transactions to pending payments by variable symbol.
 */
export async function syncFioTransactions(
  token: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ synced: number; matched: number }> {
  let transactions: FioTransaction[];

  if (dateFrom && dateTo) {
    transactions = await fetchFioTransactions(token, dateFrom, dateTo);
  } else {
    transactions = await fetchLatestFioTransactions(token);
  }

  let synced = 0;
  let matched = 0;

  for (const tx of transactions) {
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

  return { synced, matched };
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
