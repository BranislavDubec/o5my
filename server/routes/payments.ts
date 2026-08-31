import type { Express, Response } from "express";
import { storage } from "../storage";
import { BankReconciliationError } from "../storage/payments";
import { requireAdmin, requireManager, requirePaymentAccess } from "../auth";
import { insertPaymentSchema, type Payment } from "@shared/schema";
import { FioSyncError, syncFioTransactions } from "../fio-api";
import { createPaymentQrPayload, isValidIban, normalizeIban } from "../payment-qr";
import { notifyUsers } from "../notifications";
import { syncGoogleCalendarEvents } from "../google-calendar";

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeZone: "Europe/Prague",
  }).format(new Date(value));
}

function personalizePaymentDescription(template: string, userName: string): string {
  const trimmed = template.trim();
  const memberName = userName.trim();
  if (!memberName) return trimmed;

  const resolved = trimmed.replace(/\{name\}/gi, memberName);
  // If the template does not contain the {name} placeholder, append the member's name.
  return /\{name\}/i.test(trimmed) ? resolved : `${trimmed} ${memberName}`.trim();
}

function normalizePaymentIdentity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 80) : null;
}

function splitFullPrice(fullPrice: number, memberCount: number) {
  const baseAmount = Math.floor(fullPrice / memberCount);
  const remainder = fullPrice % memberCount;
  return Array.from({ length: memberCount }, (_, index) => baseAmount + (index < remainder ? 1 : 0));
}

function getPaymentNotificationContent(payment: Payment, currency: string) {
  const remainingAmount = Math.max(0, payment.amount - payment.walletAppliedAmount);
  const dueDate = formatNotificationDate(payment.dueDate);

  if (remainingAmount === 0) {
    return {
      body: `${payment.description} · ${payment.amount} ${currency} · uhradené z peňaženky`,
      heading: "Platba uhradená z peňaženky",
      buttonLabel: "Zobraziť platbu",
    };
  }
  if (payment.walletAppliedAmount > 0) {
    return {
      body: `${payment.description} · ${payment.walletAppliedAmount} ${currency} z peňaženky · zostáva ${remainingAmount} ${currency} · splatnosť ${dueDate}`,
      heading: "Nová platba – čiastočne uhradená",
      buttonLabel: "Zobraziť platbu a QR kód",
    };
  }
  return {
    body: `${payment.description} · ${payment.amount} ${currency} · splatnosť ${dueDate}`,
    heading: "Nová platba",
    buttonLabel: "Zobraziť platbu a QR kód",
  };
}

function sendBankReconciliationError(res: Response, error: unknown) {
  if (error instanceof BankReconciliationError) {
    return res.status(error.statusCode).json({ message: error.message, code: error.code });
  }
  console.error("Bank transaction reconciliation failed", error);
  return res.status(500).json({ message: "Bankovú transakciu sa nepodarilo spracovať" });
}

export function registerPaymentsRoutes(app: Express) {
  // ============ PAYMENTS ============
  app.get("/api/payments", requirePaymentAccess, (req, res) => {
    const payments = storage.getPaymentsByUser(req.user!.id);
    res.json(payments);
  });

  app.get("/api/wallet", requirePaymentAccess, (req, res) => {
    const transactions = storage.getWalletTransactionsByUser(req.user!.id);
    res.json({
      balance: storage.getWalletBalance(req.user!.id),
      currency: storage.getAppSetting("payment_currency") || "CZK",
      updatedAt: transactions[0]?.createdAt ?? null,
      transactions: transactions.map(transaction => ({
        id: transaction.id,
        amount: transaction.amount,
        description: transaction.description,
        createdAt: transaction.createdAt,
      })),
    });
  });

  app.post("/api/wallet/:userId/adjustments", requireAdmin, (req, res) => {
    const userId = Number(req.params.userId);
    const amount = Number(req.body?.amount);
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";

    if (!Number.isInteger(userId) || userId <= 0 || !storage.getUser(userId)) {
      return res.status(404).json({ message: "Používateľ nebol nájdený" });
    }
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 10_000_000) {
      return res.status(400).json({ message: "Suma musí byť nenulové celé číslo v CZK" });
    }
    if (!description || description.length > 200) {
      return res.status(400).json({ message: "Dôvod je povinný a môže mať najviac 200 znakov" });
    }

    const currentBalance = storage.getWalletBalance(userId);
    if (currentBalance + amount < 0) {
      return res.status(400).json({ message: "Zostatok peňaženky nemôže byť záporný" });
    }

    const transaction = storage.createWalletTransaction({
      userId,
      bankTransactionId: null,
      paymentId: null,
      amount,
      description: `Manuálna úprava: ${description}`,
      createdBy: req.user!.id,
    });
    if (!transaction) {
      return res.status(500).json({ message: "Úpravu peňaženky sa nepodarilo uložiť" });
    }

    res.status(201).json({
      transaction,
      balance: currentBalance + amount,
      currency: storage.getAppSetting("payment_currency") || "CZK",
    });
  });

  app.get("/api/payments/all", requireAdmin, (_req, res) => {
    const payments = storage.getAllPayments();
    res.json(payments);
  });

  app.post("/api/payments", requireAdmin, (req, res) => {
    try {
      const sendNotifications = req.body?.sendNotifications !== false;
      const data = insertPaymentSchema.parse(req.body);
      const user = storage.getUser(data.userId);
      if (!user?.isActive || !user.emailVerified || user.role === "manager") {
        return res.status(404).json({ message: "Aktívny člen nebol nájdený" });
      }
      const payment = storage.createPayment({
        ...data,
        fullPrice: typeof data.fullPrice === "number" && data.fullPrice > 0 ? data.fullPrice : data.amount,
        identity: normalizePaymentIdentity(data.identity),
        description: personalizePaymentDescription(data.description, user.name),
        variableSymbol: null,
      });
      const currency = storage.getAppSetting("payment_currency") || "CZK";
      const notification = getPaymentNotificationContent(payment, currency);
      res.status(201).json(payment);
      if (sendNotifications) {
        void notifyUsers([payment.userId], {
          title: "Nová platba",
          body: notification.body,
          path: `/#/payments/${payment.id}`,
          tag: `payment-${payment.id}`,
          emailSubject: `💳 Nová platba | ${payment.description}`,
          emailHeading: notification.heading,
          emailButtonLabel: notification.buttonLabel,
        }, { push: false });
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/payments/bulk", requireAdmin, (req, res) => {
    try {
      const sendNotifications = req.body?.sendNotifications !== false;
      const priceMode = req.body?.priceMode === "perPerson" ? "perPerson" : "full";
      const enteredPrice = Number(req.body?.price ?? req.body?.fullPrice ?? req.body?.amount);
      const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate : "";
      const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
      const identity = normalizePaymentIdentity(req.body?.identity);
      const rawUserIds = req.body?.userIds;

      if (!Number.isSafeInteger(enteredPrice) || enteredPrice <= 0) {
        return res.status(400).json({ message: "Suma musí byť kladné celé číslo" });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return res.status(400).json({ message: "Neplatný dátum splatnosti" });
      }
      if (!description) {
        return res.status(400).json({ message: "Popis je povinný" });
      }
      if (!Array.isArray(rawUserIds) || rawUserIds.length === 0) {
        return res.status(400).json({ message: "Vyber aspoň jedného člena" });
      }

      const userIds = Array.from(new Set(rawUserIds.map(value => Number(value))));
      if (userIds.length > 500 || userIds.some(id => !Number.isInteger(id) || id <= 0)) {
        return res.status(400).json({ message: "Neplatný výber členov" });
      }
      if (priceMode === "full" && enteredPrice < userIds.length) {
        return res.status(400).json({ message: "Celková suma musí byť aspoň 1 Kč na člena" });
      }

      const fullPrice = priceMode === "perPerson" ? enteredPrice * userIds.length : enteredPrice;
      if (!Number.isSafeInteger(fullPrice)) {
        return res.status(400).json({ message: "Celková suma je príliš vysoká" });
      }

      const activeUsersById = new Map(
        storage.getAllUsers()
          .filter(user => user.isActive && user.emailVerified && user.role !== "manager")
          .map(user => [user.id, user]),
      );
      const selectedUsers = userIds.map(userId => activeUsersById.get(userId));
      if (selectedUsers.some(user => !user)) {
        return res.status(400).json({ message: "Niektorý vybraný člen neexistuje alebo nie je aktívny" });
      }

      const amounts = priceMode === "perPerson"
        ? selectedUsers.map(() => enteredPrice)
        : splitFullPrice(fullPrice, selectedUsers.length);

      const paymentList = selectedUsers.map((user, index) => insertPaymentSchema.parse({
        userId: user!.id,
        amount: amounts[index],
        fullPrice,
        identity,
        dueDate,
        description: personalizePaymentDescription(description, user!.name),
      }));
      const createdPayments = storage.createPayments(paymentList);
      const currency = storage.getAppSetting("payment_currency") || "CZK";
      res.status(201).json({ created: createdPayments.length, payments: createdPayments });
      if (sendNotifications) {
        void Promise.all(createdPayments.map(payment => {
          const notification = getPaymentNotificationContent(payment, currency);
          return notifyUsers([payment.userId], {
            title: "Nová platba",
            body: notification.body,
            path: `/#/payments/${payment.id}`,
            tag: `payment-${payment.id}`,
            emailSubject: `💳 Nová platba | ${payment.description}`,
            emailHeading: notification.heading,
            emailButtonLabel: notification.buttonLabel,
          }, { push: false });
        }));
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/payments/:id", requirePaymentAccess, (req, res) => {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId)) {
      return res.status(400).json({ message: "Neplatné ID platby" });
    }

    const payment = storage.getPayment(paymentId);
    if (!payment) return res.status(404).json({ message: "Platba nenájdená" });
    if (req.user!.role !== "admin" && payment.userId !== req.user!.id) {
      return res.status(403).json({ message: "K tejto platbe nemáte prístup" });
    }

    const iban = storage.getAppSetting('payment_iban') || '';
    const recipientName = storage.getAppSetting('payment_recipient_name') || 'O5MY Futsal';
    const currency = storage.getAppSetting('payment_currency') || 'CZK';
    const outstandingAmount = Math.max(0, payment.amount - payment.walletAppliedAmount);
    const qrPayload = payment.status !== "paid" && outstandingAmount > 0 && isValidIban(iban)
      ? createPaymentQrPayload(payment, { iban, recipientName, currency }, outstandingAmount)
      : null;

    res.json({
      ...payment,
      recipientIban: iban || null,
      recipientName,
      currency,
      outstandingAmount,
      qrPayload,
    });
  });

  app.put("/api/payments/:id", requireAdmin, (req, res) => {
    const { status } = req.body;
    if (!["pending", "paid", "overdue"].includes(status)) {
      return res.status(400).json({ message: "Neplatný status" });
    }
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId)) {
      return res.status(400).json({ message: "Neplatné ID platby" });
    }
    const existingPayment = storage.getPayment(paymentId);
    if (!existingPayment) return res.status(404).json({ message: "Platba nenájdená" });
    if (existingPayment.walletAppliedAmount >= existingPayment.amount && status !== "paid") {
      return res.status(400).json({ message: "Platba bola celá uhradená z peňaženky" });
    }
    try {
      const payment = storage.updatePaymentStatus(paymentId, status);
      if (!payment) return res.status(404).json({ message: "Platba nenájdená" });
      res.json(payment);
    } catch (error) {
      sendBankReconciliationError(res, error);
    }
  });

  app.delete("/api/payments/:id", requireAdmin, (req, res) => {
    try {
      storage.deletePayment(Number(req.params.id));
      res.json({ message: "Platba zmazaná" });
    } catch (error) {
      sendBankReconciliationError(res, error);
    }
  });

  // ============ BANK (Admin) ============
  app.get("/api/bank/transactions", requireAdmin, (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const transactions = storage.getAllBankTransactions(limit);
    res.json(transactions);
  });

  app.post("/api/bank/transactions/:id/reconcile", requireAdmin, (req, res) => {
    const bankTransactionId = Number(req.params.id);
    const userId = Number(req.body?.userId);
    const rawPaymentId = req.body?.paymentId;
    const paymentId = rawPaymentId === undefined || rawPaymentId === null || rawPaymentId === ""
      ? undefined
      : Number(rawPaymentId);

    try {
      const result = storage.reconcileBankTransaction({
        bankTransactionId,
        userId,
        paymentId,
        actorId: req.user!.id,
      });
      res.json(result);
    } catch (error) {
      sendBankReconciliationError(res, error);
    }
  });

  app.post("/api/bank/transactions/retry-matching", requireAdmin, (_req, res) => {
    try {
      res.json(storage.retryUnmatchedBankTransactions());
    } catch (error) {
      console.error("Retrying bank transaction matching failed", error);
      res.status(500).json({ message: "Opakované párovanie bankových transakcií zlyhalo" });
    }
  });

  app.get("/api/cashbox", requireAdmin, (_req, res) => {
    res.json({
      balance: storage.getCashBalance(),
      transactions: storage.getAllCashTransactions(),
    });
  });

  app.post("/api/cashbox/transactions", requireAdmin, (req, res) => {
    const type = typeof req.body?.type === "string" ? req.body.type : "";
    const amount = Number(req.body?.amount);
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({ message: "Vyber príjem alebo výdavok" });
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
      return res.status(400).json({ message: "Suma musí byť celé kladné číslo" });
    }
    if (!description || description.length > 200) {
      return res.status(400).json({ message: "Popis je povinný a môže mať najviac 200 znakov" });
    }
    if (type === "expense" && amount > storage.getCashBalance()) {
      return res.status(400).json({ message: "V pokladničke nie je dostatok hotovosti" });
    }
    const transaction = storage.createCashTransaction({
      type,
      amount,
      description,
      createdBy: req.user!.id,
    });
    res.status(201).json({ transaction, balance: storage.getCashBalance() });
  });

  app.delete("/api/cashbox/transactions/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Neplatné ID pohybu" });
    const transaction = storage.getAllCashTransactions().find(candidate => candidate.id === id);
    if (!transaction) return res.status(404).json({ message: "Pohyb nebol nájdený" });
    if (transaction.type === "income" && storage.getCashBalance() - transaction.amount < 0) {
      return res.status(400).json({ message: "Príjem nemožno zmazať, pokladnička by mala záporný zostatok" });
    }
    if (!storage.deleteCashTransaction(id)) return res.status(404).json({ message: "Pohyb nebol nájdený" });
    res.json({ message: "Pohyb bol zmazaný", balance: storage.getCashBalance() });
  });

  app.post("/api/bank/sync", requireAdmin, async (req, res) => {
    try {
      const token = storage.getAppSetting('fio_token');
      if (!token) {
        return res.status(400).json({ message: "FIO API token nie je nastavený" });
      }
      const { dateFrom, dateTo } = req.body || {};
      const result = await syncFioTransactions(token, dateFrom, dateTo);
      res.json(result);
    } catch (err: any) {
      if (err instanceof FioSyncError) {
        if (err.retryAfterSeconds) res.setHeader("Retry-After", String(err.retryAfterSeconds));
        return res.status(err.statusCode).json({ message: err.message });
      }
      res.status(500).json({ message: err.message || "Synchronizácia zlyhala" });
    }
  });

  app.post("/api/calendar/sync", requireManager, async (req, res) => {
    try {
      const result = await syncGoogleCalendarEvents({
        calendarId: req.body?.calendarId,
        userId: req.user!.id,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Synchronizácia kalendára zlyhala" });
    }
  });

  app.get("/api/bank/settings", requireAdmin, (_req, res) => {
    const token = storage.getAppSetting('fio_token');
    const lastSync = storage.getAppSetting('fio_last_sync');
    const storedBalance = storage.getAppSetting('fio_account_balance');
    const parsedBalance = storedBalance === undefined ? null : Number(storedBalance);
    res.json({
      hasToken: !!token,
      lastSync,
      paymentIban: storage.getAppSetting('payment_iban') || '',
      paymentRecipientName: storage.getAppSetting('payment_recipient_name') || 'O5MY Futsal',
      paymentCurrency: storage.getAppSetting('payment_currency') || 'CZK',
      accountBalance: parsedBalance !== null && Number.isFinite(parsedBalance) ? parsedBalance : null,
      balanceUpdatedAt: storage.getAppSetting('fio_balance_updated_at') || null,
      lastSyncError: storage.getAppSetting('fio_last_sync_error') || null,
    });
  });

  app.put("/api/bank/settings", requireAdmin, (req, res) => {
    const { fioToken, paymentIban, paymentRecipientName, paymentCurrency } = req.body || {};
    if (typeof fioToken === "string" && fioToken.trim()) {
      const normalizedToken = fioToken.trim();
      if (normalizedToken.length !== 64) {
        return res.status(400).json({ message: "FIO API token musí mať presne 64 znakov" });
      }
      storage.setAppSetting('fio_token', normalizedToken);
      storage.setAppSetting('fio_sync_cursor_date', '');
      storage.setAppSetting('fio_last_sync_error', '');
      storage.setAppSetting('fio_last_sync_error_data', '');
    }

    if (typeof paymentIban === "string") {
      const iban = normalizeIban(paymentIban);
      if (iban && !isValidIban(iban)) {
        return res.status(400).json({ message: "IBAN nemá platný formát" });
      }
      storage.setAppSetting('payment_iban', iban);
    }

    if (typeof paymentRecipientName === "string") {
      storage.setAppSetting('payment_recipient_name', paymentRecipientName.trim().slice(0, 70));
    }

    if (typeof paymentCurrency === "string") {
      const currency = paymentCurrency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        return res.status(400).json({ message: "Mena musí mať trojpísmenový kód" });
      }
      storage.setAppSetting('payment_currency', currency);
    }
    res.json({ message: "Nastavenia uložené" });
  });

  app.put("/api/bank/transactions/:id/match", requireAdmin, (req, res) => {
    const paymentId = Number(req.body?.paymentId);
    const payment = Number.isInteger(paymentId) && paymentId > 0
      ? storage.getPayment(paymentId)
      : undefined;
    if (!payment) {
      return res.status(400).json({
        message: "Zrušenie spárovania nie je podporované; vyber platbu na bezpečné spracovanie",
      });
    }

    try {
      const result = storage.reconcileBankTransaction({
        bankTransactionId: Number(req.params.id),
        userId: payment.userId,
        paymentId: payment.id,
        actorId: req.user!.id,
      });
      res.json(result);
    } catch (error) {
      sendBankReconciliationError(res, error);
    }
  });
}
