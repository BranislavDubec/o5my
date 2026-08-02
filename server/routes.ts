import type { Express } from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import { requireAuth, requireAdmin } from "./auth";
import { configureSession } from "./session";
import { registerAuthRoutes } from "./routes/auth-routes";
import { syncFioTransactions } from "./fio-api";
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent, syncGoogleCalendarEvents, updateGoogleCalendarEventAttendance } from "./google-calendar";
import { insertEventSchema, insertPollSchema, insertPaymentSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  configureSession(app);
  registerAuthRoutes(app);

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

  app.put("/api/events/:id", requireAdmin, (req, res) => {
    const event = storage.updateEvent(Number(req.params.id), req.body);
    if (!event) return res.status(404).json({ message: "Event nenájdený" });
    res.json(event);
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
      const payment = storage.createPayment(data);
      res.status(201).json(payment);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
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
    res.json({ hasToken: !!token, lastSync });
  });

  app.put("/api/bank/settings", requireAdmin, (req, res) => {
    const { fioToken } = req.body;
    if (fioToken) {
      storage.setAppSetting('fio_token', fioToken);
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
    res.json(settings || { pushEnabled: true, emailEnabled: true });
  });

  app.put("/api/settings/notifications", requireAuth, (req, res) => {
    const { pushEnabled, emailEnabled, pushSubscription } = req.body;
    storage.upsertNotificationSettings({
      userId: req.user!.id,
      pushEnabled,
      emailEnabled,
      pushSubscription: pushSubscription ? JSON.stringify(pushSubscription) : undefined,
    });
    res.json({ message: "Nastavenia uložené" });
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
