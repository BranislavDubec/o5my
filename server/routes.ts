import type { Express } from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import { requireAuth, requireAdmin } from "./auth";
import { configureSession } from "./session";
import { registerAuthRoutes } from "./routes/auth-routes";
import { syncFioTransactions } from "./fio-api";
import { createPaymentQrPayload, isValidIban, normalizeIban } from "./payment-qr";
import { registerMediaRoutes } from "./media-routes";
import { getVapidPublicKey, notifyUsers } from "./notifications";
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent, syncGoogleCalendarEvents, updateGoogleCalendarEvent, updateGoogleCalendarEventAttendance } from "./google-calendar";
import { insertEventSchema, insertPollSchema, insertPaymentSchema } from "@shared/schema";

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeZone: "Europe/Prague",
  }).format(new Date(value));
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  configureSession(app);
  registerAuthRoutes(app);
  registerMediaRoutes(app);

  // ============ EVENTS ============
  app.get("/api/events", requireAuth, (req, res) => {
    const allEvents = storage.getAllEvents();
    res.json(allEvents.map(event => ({
      ...event,
      attendanceStatus: storage.getEventResponse(event.id, req.user!.id)?.status ?? null,
    })));
  });

  app.get("/api/events/upcoming", requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit as string) || 5;
    const events = storage.getUpcomingEvents(limit);
    res.json(events.map(event => ({
      ...event,
      attendanceStatus: storage.getEventResponse(event.id, req.user!.id)?.status ?? null,
    })));
  });

  app.get("/api/events/:id", requireAuth, (req, res) => {
    const event = storage.getEvent(Number(req.params.id));
    if (!event) return res.status(404).json({ message: "Event nenájdený" });
    res.json(event);
  });

  app.post("/api/events", requireAdmin, async (req, res) => {
    try {
      const data = insertEventSchema.parse({
        ...req.body,
        createdBy: req.user!.id,
      });
      const event = storage.createEvent(data);

      try {
        const googleEvent = await createGoogleCalendarEvent({
          type: event.type,
          title: event.title,
          description: event.description,
          location: event.location,
          startTime: event.startTime,
          endTime: event.endTime,
          opponent: event.opponent,
          homeAway: event.homeAway,
        });

        if (googleEvent?.id) {
          storage.updateEvent(event.id, {
            externalId: googleEvent.id,
            source: "local",
          });
        }
      } catch (googleErr: any) {
        console.error("Failed to create Google Calendar event", googleErr.message || googleErr);
      }

      res.status(201).json(event);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put("/api/events/:id", requireAdmin, async (req, res) => {
    const eventId = Number(req.params.id);
    const existing = storage.getEvent(eventId);
    if (!existing) return res.status(404).json({ message: "Event nenájdený" });

    const body = req.body || {};
    if (!["match", "training", "teambuilding"].includes(body.type)) {
      return res.status(400).json({ message: "Neplatný typ eventu" });
    }
    if (typeof body.title !== "string" || !body.title.trim()) {
      return res.status(400).json({ message: "Názov je povinný" });
    }
    if (typeof body.startTime !== "string" || Number.isNaN(new Date(body.startTime).getTime())) {
      return res.status(400).json({ message: "Neplatný začiatok eventu" });
    }
    if (body.endTime && Number.isNaN(new Date(body.endTime).getTime())) {
      return res.status(400).json({ message: "Neplatný koniec eventu" });
    }
    if (body.endTime && new Date(body.endTime).getTime() < new Date(body.startTime).getTime()) {
      return res.status(400).json({ message: "Koniec eventu nemôže byť pred začiatkom" });
    }

    const event = storage.updateEvent(eventId, {
      type: body.type,
      title: body.title.trim(),
      description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
      location: typeof body.location === "string" && body.location.trim() ? body.location.trim() : null,
      startTime: body.startTime,
      endTime: body.endTime || null,
      opponent: body.type === "match" && typeof body.opponent === "string" && body.opponent.trim()
        ? body.opponent.trim()
        : null,
      homeAway: body.type === "match" && ["home", "away"].includes(body.homeAway)
        ? body.homeAway
        : null,
    });
    if (!event) return res.status(404).json({ message: "Event nenájdený" });

    let googleSyncWarning: string | undefined;
    if (event.externalId) {
      try {
        await updateGoogleCalendarEvent(event);
        const responses = storage.getEventResponses(event.id);
        if (responses.length > 0) {
          await updateGoogleCalendarEventAttendance(event, responses);
        }
      } catch (googleErr: any) {
        console.error("Failed to update Google Calendar event", googleErr.message || googleErr);
        googleSyncWarning = "Event bol uložený, ale Google Calendar sa nepodarilo aktualizovať.";
      }
    }

    res.json({ ...event, googleSyncWarning });
  });

  app.delete("/api/events/:id", requireAuth, async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Vyžadované admin práva" });
    }

    const eventId = Number(req.params.id);
    const event = storage.getEvent(eventId);
    if (!event) return res.status(404).json({ message: "Event nenájdený" });

    try {
      if (event.externalId) {
        await deleteGoogleCalendarEvent(event.externalId);
      }
    } catch (googleErr: any) {
      console.error("Failed to delete Google Calendar event", googleErr.message || googleErr);
    }

    storage.deleteEvent(eventId);
    res.json({ message: "Event zmazaný" });
  });

  // ============ EVENT RESPONSES (Attendance) ============
  app.get("/api/events/:id/responses", requireAuth, (req, res) => {
    const responses = storage.getEventResponses(Number(req.params.id));
    res.json(responses);
  });

  app.post("/api/events/:id/responses", requireAuth, async (req, res) => {
    const eventId = Number(req.params.id);
    const { status, note } = req.body;
    if (!["going", "not_going", "maybe"].includes(status)) {
      return res.status(400).json({ message: "Neplatný status" });
    }

    const event = storage.getEvent(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event nenájdený" });
    }

    storage.upsertEventResponse({
      eventId,
      userId: req.user!.id,
      status,
      note,
    });

    res.json({ message: "Účasť aktualizovaná" });

    void (async () => {
      try {
        const responses = storage.getEventResponses(eventId);
        await updateGoogleCalendarEventAttendance(event, responses);
      } catch (googleErr: any) {
        console.error("Failed to update Google Calendar attendance", googleErr.message || googleErr);
      }
    })();
  });

  // ============ POLLS ============
  app.get("/api/polls", requireAuth, (_req, res) => {
    const allPolls = storage.getAllPolls();
    res.json(allPolls);
  });

  app.get("/api/polls/:id", requireAuth, (req, res) => {
    const poll = storage.getPoll(Number(req.params.id));
    if (!poll) return res.status(404).json({ message: "Anketa nenájdená" });
    const options = storage.getPollOptions(poll.id);
    const votes = storage.getPollVotes(poll.id);
    const userVote = storage.getUserPollVote(poll.id, req.user!.id);
    res.json({ ...poll, options, votes, userVote });
  });

  app.post("/api/polls", requireAdmin, (req, res) => {
    try {
      const { options, ...pollData } = req.body;
      const data = insertPollSchema.parse({
        ...pollData,
        createdBy: req.user!.id,
      });
      const poll = storage.createPoll(data);
      if (options && Array.isArray(options)) {
        storage.createPollOptions(
          options.map((label: string) => ({ pollId: poll.id, label }))
        );
      }
      res.status(201).json(poll);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/polls/:id", requireAdmin, (req, res) => {
    storage.deletePoll(Number(req.params.id));
    res.json({ message: "Anketa zmazaná" });
  });

  // ============ POLL VOTES ============
  app.post("/api/polls/:id/votes", requireAuth, (req, res) => {
    const pollId = Number(req.params.id);
    const { optionId } = req.body;
    if (!optionId) {
      return res.status(400).json({ message: "Option ID je povinné" });
    }
    storage.upsertPollVote({
      pollId,
      optionId: parseInt(optionId),
      userId: req.user!.id,
    });
    res.json({ message: "Hlas zaznamenaný" });
  });

  // ============ USERS (Admin) ============
  app.get("/api/users", requireAdmin, (_req, res) => {
    const allUsers = storage.getAllUsers().map(({ password, ...u }) => u);
    res.json(allUsers);
  });

  app.put("/api/users/:id/role", requireAdmin, (req, res) => {
    const { role } = req.body;
    if (!["admin", "player"].includes(role)) {
      return res.status(400).json({ message: "Neplatná rola" });
    }
    const user = storage.updateUserRole(Number(req.params.id), role);
    if (!user) return res.status(404).json({ message: "Používateľ nenájdený" });
    const { password, ...safe } = user;
    res.json(safe);
  });

  app.put("/api/users/:id/status", requireAdmin, (req, res) => {
    const userId = Number(req.params.id);
    if (userId === req.user!.id) {
      return res.status(400).json({ message: "Nemôžete deaktivovať vlastný účet" });
    }

    if (typeof req.body?.isActive !== "boolean") {
      return res.status(400).json({ message: "Neplatný stav účtu" });
    }

    const user = storage.updateUserActiveStatus(userId, req.body.isActive);
    if (!user) return res.status(404).json({ message: "Používateľ nenájdený" });

    const { password, ...safe } = user;
    res.json(safe);
  });

  // ============ PAYMENTS ============
  app.get("/api/payments", requireAuth, (req, res) => {
    const payments = storage.getPaymentsByUser(req.user!.id);
    res.json(payments);
  });

  app.get("/api/payments/all", requireAdmin, (_req, res) => {
    const payments = storage.getAllPayments();
    res.json(payments);
  });

  app.post("/api/payments", requireAdmin, (req, res) => {
    try {
      const data = insertPaymentSchema.parse(req.body);
      const user = storage.getUser(data.userId);
      if (!user?.isActive) {
        return res.status(404).json({ message: "Aktívny člen nebol nájdený" });
      }
      const payment = storage.createPayment({
        ...data,
        variableSymbol: null,
      });
      res.status(201).json(payment);
      void notifyUsers([payment.userId], {
        title: "Nová platba",
        body: `${payment.description} · ${payment.amount} CZK · splatnosť ${formatNotificationDate(payment.dueDate)}`,
        path: `/#/payments/${payment.id}`,
        tag: `payment-${payment.id}`,
        emailSubject: `💳 Nová platba | ${payment.description}`,
        emailHeading: "Nová platba",
        emailButtonLabel: "Zobraziť platbu a QR kód",
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/payments/bulk", requireAdmin, (req, res) => {
    try {
      const amount = Number(req.body?.amount);
      const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate : "";
      const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";

      if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({ message: "Suma musí byť kladné celé číslo" });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return res.status(400).json({ message: "Neplatný dátum splatnosti" });
      }
      if (!description) {
        return res.status(400).json({ message: "Popis je povinný" });
      }

      const activeUsers = storage.getAllUsers().filter(user => user.isActive);
      if (activeUsers.length === 0) {
        return res.status(400).json({ message: "Nie sú žiadni aktívni členovia" });
      }

      const paymentList = activeUsers.map(user => insertPaymentSchema.parse({
        userId: user.id,
        amount,
        dueDate,
        description,
      }));
      const createdPayments = storage.createPayments(paymentList);
      res.status(201).json({ created: createdPayments.length, payments: createdPayments });
      void Promise.all(createdPayments.map(payment => notifyUsers([payment.userId], {
        title: "Nová platba",
        body: `${payment.description} · ${payment.amount} CZK · splatnosť ${formatNotificationDate(payment.dueDate)}`,
        path: `/#/payments/${payment.id}`,
        tag: `payment-${payment.id}`,
        emailSubject: `💳 Nová platba | ${payment.description}`,
        emailHeading: "Nová platba",
        emailButtonLabel: "Zobraziť platbu a QR kód",
      })));
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/payments/:id", requireAuth, (req, res) => {
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
    const qrPayload = isValidIban(iban)
      ? createPaymentQrPayload(payment, { iban, recipientName, currency })
      : null;

    res.json({
      ...payment,
      recipientIban: iban || null,
      recipientName,
      currency,
      qrPayload,
    });
  });

  app.put("/api/payments/:id", requireAdmin, (req, res) => {
    const { status } = req.body;
    if (!["pending", "paid", "overdue"].includes(status)) {
      return res.status(400).json({ message: "Neplatný status" });
    }
    const payment = storage.updatePaymentStatus(Number(req.params.id), status);
    if (!payment) return res.status(404).json({ message: "Platba nenájdená" });
    res.json(payment);
  });

  app.delete("/api/payments/:id", requireAdmin, (req, res) => {
    storage.deletePayment(Number(req.params.id));
    res.json({ message: "Platba zmazaná" });
  });

  // ============ BANK (Admin) ============
  app.get("/api/bank/transactions", requireAdmin, (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const transactions = storage.getAllBankTransactions(limit);
    res.json(transactions);
  });

  app.post("/api/bank/sync", requireAdmin, async (req, res) => {
    try {
      const token = storage.getAppSetting('fio_token');
      if (!token) {
        return res.status(400).json({ message: "FIO API token nie je nastavený" });
      }
      const { dateFrom, dateTo } = req.body || {};
      const result = await syncFioTransactions(token, dateFrom, dateTo);
      storage.setAppSetting('fio_last_sync', new Date().toISOString());
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Synchronizácia zlyhala" });
    }
  });

  app.post("/api/calendar/sync", requireAdmin, async (req, res) => {
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
    res.json({
      hasToken: !!token,
      lastSync,
      paymentIban: storage.getAppSetting('payment_iban') || '',
      paymentRecipientName: storage.getAppSetting('payment_recipient_name') || 'O5MY Futsal',
      paymentCurrency: storage.getAppSetting('payment_currency') || 'CZK',
    });
  });

  app.put("/api/bank/settings", requireAdmin, (req, res) => {
    const { fioToken, paymentIban, paymentRecipientName, paymentCurrency } = req.body || {};
    if (typeof fioToken === "string" && fioToken.trim()) {
      storage.setAppSetting('fio_token', fioToken.trim());
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
    const { paymentId } = req.body;
    const txId = Number(req.params.id);
    if (paymentId) {
      const pid = parseInt(paymentId);
      storage.updateBankTransactionMatch(txId, pid);
      storage.updatePaymentStatus(pid, 'paid');
    } else {
      // Unmatch
      const transactions = storage.getAllBankTransactions();
      const tx = transactions.find(t => t.id === txId);
      if (tx?.matchedPaymentId) {
        storage.updatePaymentStatus(tx.matchedPaymentId, 'pending');
        storage.updateBankTransactionMatch(txId, null);
      }
    }
    res.json({ message: "Transakcia aktualizovaná" });
  });

  // ============ NOTIFICATION SETTINGS ============
  app.get("/api/settings/notifications", requireAuth, (req, res) => {
    const settings = storage.getNotificationSettings(req.user!.id);
    res.json({
      pushEnabled: settings?.pushEnabled ?? true,
      emailEnabled: settings?.emailEnabled ?? true,
      subscriptionCount: storage.getPushSubscriptionsByUser(req.user!.id).length,
    });
  });

  app.put("/api/settings/notifications", requireAuth, (req, res) => {
    const updates: { userId: number; pushEnabled?: boolean; emailEnabled?: boolean } = { userId: req.user!.id };
    if (typeof req.body?.pushEnabled === "boolean") updates.pushEnabled = req.body.pushEnabled;
    if (typeof req.body?.emailEnabled === "boolean") updates.emailEnabled = req.body.emailEnabled;
    if (updates.pushEnabled === undefined && updates.emailEnabled === undefined) {
      return res.status(400).json({ message: "Nie sú zadané žiadne platné nastavenia" });
    }
    storage.upsertNotificationSettings(updates);
    res.json({ message: "Nastavenia uložené" });
  });

  app.get("/api/notifications/vapid-public-key", requireAuth, (_req, res) => {
    res.json({ publicKey: getVapidPublicKey() });
  });

  app.post("/api/notifications/subscribe", requireAuth, (req, res) => {
    const subscription = req.body;
    const endpoint = typeof subscription?.endpoint === "string" ? subscription.endpoint : "";
    const p256dh = typeof subscription?.keys?.p256dh === "string" ? subscription.keys.p256dh : "";
    const auth = typeof subscription?.keys?.auth === "string" ? subscription.keys.auth : "";
    const isBase64Url = (value: string) => /^[A-Za-z0-9_-]+$/.test(value);
    if (!endpoint.startsWith("https://") || endpoint.length > 2048 || !isBase64Url(p256dh) || !isBase64Url(auth) || p256dh.length > 1024 || auth.length > 1024) {
      return res.status(400).json({ message: "Neplatný push odber" });
    }

    storage.upsertPushSubscription(req.user!.id, endpoint, JSON.stringify(subscription));
    storage.upsertNotificationSettings({ userId: req.user!.id, pushEnabled: true });
    res.status(201).json({ message: "Push notifikácie sú aktívne" });
  });

  app.delete("/api/notifications/subscribe", requireAuth, (req, res) => {
    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
    if (!endpoint) return res.status(400).json({ message: "Endpoint je povinný" });
    storage.deletePushSubscription(req.user!.id, endpoint);
    res.json({ message: "Push odber bol odstránený" });
  });

  app.post("/api/admin/notifications", requireAdmin, async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const context = typeof req.body?.context === "string" ? req.body.context : "general";
    const target = typeof req.body?.target === "string" ? req.body.target : "all";

    if (!title || title.length > 100) {
      return res.status(400).json({ message: "Nadpis je povinný a môže mať najviac 100 znakov" });
    }
    if (!body || body.length > 800) {
      return res.status(400).json({ message: "Text je povinný a môže mať najviac 800 znakov" });
    }
    if (!["general", "event", "payment"].includes(context)) {
      return res.status(400).json({ message: "Neplatný kontext notifikácie" });
    }
    if (!["all", "user", "event_unanswered", "unpaid"].includes(target)) {
      return res.status(400).json({ message: "Neplatný výber príjemcov" });
    }

    const eligibleUsers = storage.getAllUsers().filter(user => user.isActive && user.emailVerified);
    let path = "/#/";
    let recipientIds: number[] = [];

    if (context === "event") {
      const eventId = Number(req.body?.eventId);
      const event = Number.isInteger(eventId) ? storage.getEvent(eventId) : undefined;
      if (!event) return res.status(400).json({ message: "Vyber platný event" });
      path = `/#/events/${event.id}`;
    } else if (context === "payment") {
      path = "/#/payments";
    }

    if (target === "all") {
      recipientIds = eligibleUsers.map(user => user.id);
    } else if (target === "user") {
      const userId = Number(req.body?.userId);
      const user = eligibleUsers.find(candidate => candidate.id === userId);
      if (!user) return res.status(400).json({ message: "Vyber aktívneho člena" });
      recipientIds = [user.id];
    } else if (target === "event_unanswered") {
      if (context !== "event") {
        return res.status(400).json({ message: "Tento výber príjemcov vyžaduje event" });
      }
      const eventId = Number(req.body?.eventId);
      recipientIds = eligibleUsers
        .filter(user => !storage.getEventResponse(eventId, user.id))
        .map(user => user.id);
    } else if (target === "unpaid") {
      if (context !== "payment") {
        return res.status(400).json({ message: "Tento výber príjemcov vyžaduje kontext platieb" });
      }
      const unpaidUserIds = new Set(
        storage.getAllPayments()
          .filter(payment => payment.status !== "paid")
          .map(payment => payment.userId),
      );
      recipientIds = eligibleUsers.filter(user => unpaidUserIds.has(user.id)).map(user => user.id);
    }

    if (recipientIds.length === 0) {
      return res.status(400).json({ message: "Vybranému filtru nezodpovedá žiadny člen" });
    }

    await notifyUsers(recipientIds, {
      title,
      body,
      path,
      tag: `manual-${Date.now().toString(36)}`,
      emailSubject: `🔔 ${title}`,
      emailHeading: title,
      emailButtonLabel: context === "event"
        ? "Otvoriť event"
        : context === "payment"
          ? "Otvoriť platby"
          : "Otvoriť aplikáciu",
    });

    res.json({ message: "Notifikácia bola odoslaná", recipientCount: recipientIds.length });
  });

  app.post("/api/notifications/test", requireAuth, (req, res) => {
    res.json({ message: "Testovacia notifikácia bola odoslaná" });
    void notifyUsers([req.user!.id], {
      title: "O5MY notifikácie fungujú",
      body: "Toto je testovacia push a emailová notifikácia.",
      path: "/#/settings",
      tag: `test-${req.user!.id}`,
      emailSubject: "🔔 Test notifikácií | O5MY Futsal",
      emailHeading: "Notifikácie fungujú",
      emailButtonLabel: "Otvoriť nastavenia",
    });
  });

  app.put("/api/settings/theme", requireAuth, (req, res) => {
    const { theme } = req.body;
    if (theme !== "light" && theme !== "dark") {
      return res.status(400).json({ message: "Neplatný farebný režim" });
    }

    const user = storage.updateUserTheme(req.user!.id, theme);
    if (!user) {
      return res.status(404).json({ message: "Používateľ nenájdený" });
    }

    res.json({ theme: user.theme });
  });

  // ============ DASHBOARD STATS ============
  app.get("/api/stats", requireAuth, (req, res) => {
    const users = storage.getAllUsers();
    const events = storage.getAllEvents();
    const polls = storage.getAllPolls();
    const now = new Date().toISOString();
    const upcomingEventsWithAttendance = events
      .filter(event => event.startTime >= now)
      .map(event => ({
        ...event,
        attendanceStatus: storage.getEventResponse(event.id, req.user!.id)?.status ?? null,
      }));
    const activePolls = polls.filter(poll => !poll.closesAt || poll.closesAt >= now);
    const outstandingPayments = storage
      .getPaymentsByUser(req.user!.id)
      .filter(payment => payment.status !== "paid");

    res.json({
      playerCount: users.filter(user => user.isActive).length,
      eventCount: events.length,
      upcomingEvents: upcomingEventsWithAttendance.slice(0, 5),
      unansweredEvents: upcomingEventsWithAttendance
        .filter(event => !event.attendanceStatus)
        .slice(0, 5),
      activePolls: activePolls.length,
      unansweredPolls: activePolls
        .filter(poll => !storage.getUserPollVote(poll.id, req.user!.id))
        .slice(0, 5),
      outstandingPayments,
    });
  });

  return httpServer;
}
