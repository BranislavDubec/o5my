import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../auth";
import { getVapidPublicKey, notifyUsers } from "../notifications";

export function registerNotificationsRoutes(app: Express) {
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

  // ============ ADMIN NOTIFICATIONS ============
  app.post("/api/admin/notifications", requireAdmin, async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const context = typeof req.body?.context === "string" ? req.body.context : "general";
    const target = typeof req.body?.target === "string" ? req.body.target : "all";
    const paymentIdentity = typeof req.body?.paymentIdentity === "string" ? req.body.paymentIdentity.trim() : "";

    if (!title || title.length > 100) {
      return res.status(400).json({ message: "Nadpis je povinný a môže mať najviac 100 znakov" });
    }
    if (!body || body.length > 800) {
      return res.status(400).json({ message: "Text je povinný a môže mať najviac 800 znakov" });
    }
    if (!["general", "event", "payment"].includes(context)) {
      return res.status(400).json({ message: "Neplatný kontext notifikácie" });
    }
    if (!["all", "user", "event_unanswered", "payment_identity", "unpaid"].includes(target)) {
      return res.status(400).json({ message: "Neplatný výber príjemcov" });
    }

    const eligibleUsers = storage.getAllUsers().filter(user => user.isActive && user.emailVerified);
    let path = "/#/";
    let recipientIds: number[] = [];
    let selectedEvent: ReturnType<typeof storage.getEvent>;

    if (context === "event") {
      const eventId = Number(req.body?.eventId);
      const event = Number.isInteger(eventId) ? storage.getEvent(eventId) : undefined;
      if (!event) return res.status(400).json({ message: "Vyber platný event" });
      selectedEvent = event;
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
        .filter(user => selectedEvent?.type !== "match" || user.isPlayerActive)
        .filter(user => !storage.getEventResponse(eventId, user.id))
        .map(user => user.id);
    } else if (target === "unpaid") {
      if (context !== "payment") {
        return res.status(400).json({ message: "Tento výber príjemcov vyžaduje kontext platieb" });
      }
      const unpaidPayments = storage.getAllPayments().filter(payment => payment.status !== "paid");
      const filteredUnpaidPayments = paymentIdentity
        ? unpaidPayments.filter(payment => (payment.identity ?? "") === paymentIdentity)
        : unpaidPayments;
      const unpaidUserIds = new Set(
        filteredUnpaidPayments.map(payment => payment.userId),
      );
      recipientIds = eligibleUsers.filter(user => unpaidUserIds.has(user.id)).map(user => user.id);
    } else if (target === "payment_identity") {
      if (context !== "payment") {
        return res.status(400).json({ message: "Tento výber príjemcov vyžaduje kontext platieb" });
      }
      const matchingUserIds = new Set(
        storage.getAllPayments()
          .filter(payment => !paymentIdentity || (payment.identity ?? "") === paymentIdentity)
          .map(payment => payment.userId),
      );
      recipientIds = eligibleUsers.filter(user => matchingUserIds.has(user.id)).map(user => user.id);
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
}
