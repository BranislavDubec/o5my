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
import {
  insertEventSchema, insertPollSchema, insertPaymentSchema,
  insertTeamResponsibilitySchema, insertTeamInventoryItemSchema,
} from "@shared/schema";

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeZone: "Europe/Prague",
  }).format(new Date(value));
}

function parseTeamResponsibility(body: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const section = typeof input.section === "string" ? input.section.trim() : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const kind = typeof input.kind === "string" ? input.kind : "responsibility";
  const status = typeof input.status === "string" ? input.status : "ok";
  const owner = typeof input.owner === "string" ? input.owner.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const location = typeof input.location === "string" ? input.location.trim() : "";
  const parseQuantity = (value: unknown, label: string) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
      throw new Error(`${label} musí byť celé nezáporné číslo`);
    }
    return parsed;
  };
  const quantity = parseQuantity(input.quantity, "Počet");
  const usableQuantity = parseQuantity(input.usableQuantity, "Počet použiteľných kusov");
  const rawOwnerIds = Array.isArray(input.ownerIds) ? input.ownerIds : [];
  const ownerIds = Array.from(new Set(rawOwnerIds.map(Number)));

  if (!section || section.length > 80) {
    throw new Error("Oblasť je povinná a môže mať najviac 80 znakov");
  }
  if (!title || title.length > 160) {
    throw new Error("Názov je povinný a môže mať najviac 160 znakov");
  }
  if (!["responsibility", "inventory"].includes(kind)) {
    throw new Error("Neplatný typ položky");
  }
  if (!["ok", "attention", "done"].includes(status)) {
    throw new Error("Neplatný stav položky");
  }
  if (owner.length > 160) {
    throw new Error("Zodpovedná osoba môže mať najviac 160 znakov");
  }
  if (notes.length > 10_000) {
    throw new Error("Poznámky môžu mať najviac 10 000 znakov");
  }
  if (location.length > 200) {
    throw new Error("Umiestnenie môže mať najviac 200 znakov");
  }
  if (usableQuantity !== null && quantity !== null && usableQuantity > quantity) {
    throw new Error("Počet použiteľných kusov nemôže byť vyšší ako celkový počet");
  }
  if (ownerIds.length > 50 || ownerIds.some(id => !Number.isInteger(id))) {
    throw new Error("Neplatný výber zodpovedných členov");
  }
  if (ownerIds.some(id => !storage.getUser(id)?.isActive)) {
    throw new Error("Zodpovedať môže iba aktívny člen");
  }

  return {
    data: insertTeamResponsibilitySchema.parse({
      section,
      title,
      kind,
      status,
      owner: owner || null,
      notes: notes || null,
      quantity: kind === "inventory" ? quantity : null,
      usableQuantity: kind === "inventory" ? usableQuantity : null,
      location: kind === "inventory" ? location || null : null,
    }),
    ownerIds,
  };
}

function parseTeamInventoryItem(body: unknown, responsibilityId: number) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const status = typeof input.status === "string" ? input.status : "ok";
  const location = typeof input.location === "string" ? input.location.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const parseQuantity = (value: unknown, label: string) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
      throw new Error(`${label} musí byť celé nezáporné číslo`);
    }
    return parsed;
  };
  const quantity = parseQuantity(input.quantity, "Počet");
  const usableQuantity = parseQuantity(input.usableQuantity, "Počet použiteľných kusov");

  if (!name || name.length > 160) {
    throw new Error("Názov veci je povinný a môže mať najviac 160 znakov");
  }
  if (!["ok", "attention", "done"].includes(status)) {
    throw new Error("Neplatný stav inventárnej položky");
  }
  if (location.length > 200) {
    throw new Error("Umiestnenie môže mať najviac 200 znakov");
  }
  if (notes.length > 2_000) {
    throw new Error("Poznámka môže mať najviac 2 000 znakov");
  }
  if (usableQuantity !== null && quantity !== null && usableQuantity > quantity) {
    throw new Error("Počet použiteľných kusov nemôže byť vyšší ako celkový počet");
  }

  return insertTeamInventoryItemSchema.parse({
    responsibilityId,
    name,
    status,
    quantity,
    usableQuantity,
    location: location || null,
    notes: notes || null,
  });
}

function parseMatchResult(body: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const parseCount = (value: unknown, label: string, maximum = 100) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum) {
      throw new Error(`${label} musí byť celé číslo od 0 do ${maximum}`);
    }
    return parsed;
  };
  const teamScore = parseCount(input.teamScore, "Skóre O5MY");
  const opponentScore = parseCount(input.opponentScore, "Skóre súpera");
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > 2_000) throw new Error("Poznámka môže mať najviac 2 000 znakov");

  const rawPlayers = input.players === undefined ? [] : input.players;
  if (!Array.isArray(rawPlayers) || rawPlayers.length > 100) {
    throw new Error("Neplatný zoznam hráčov");
  }
  const players = rawPlayers.map(rawPlayer => {
    const player = rawPlayer && typeof rawPlayer === "object" ? rawPlayer as Record<string, unknown> : {};
    return {
      userId: parseCount(player.userId, "ID hráča", 1_000_000),
      goals: parseCount(player.goals ?? 0, "Počet gólov"),
      assists: parseCount(player.assists ?? 0, "Počet asistencií"),
    };
  }).filter(player => player.goals > 0 || player.assists > 0);

  if (new Set(players.map(player => player.userId)).size !== players.length) {
    throw new Error("Každý hráč môže byť vo výsledku iba raz");
  }
  if (players.some(player => {
    const user = storage.getUser(player.userId);
    return !user?.isActive || !user.emailVerified;
  })) {
    throw new Error("Góly a asistencie možno zapísať iba aktívnym hráčom");
  }
  if (players.reduce((sum, player) => sum + player.goals, 0) > teamScore) {
    throw new Error("Súčet gólov hráčov nemôže byť vyšší ako skóre O5MY");
  }
  if (players.reduce((sum, player) => sum + player.assists, 0) > teamScore) {
    throw new Error("Súčet asistencií nemôže byť vyšší ako skóre O5MY");
  }

  return { teamScore, opponentScore, notes: notes || null, players };
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
      matchResult: storage.getMatchResult(event.id) ?? null,
    })));
  });

  app.get("/api/events/upcoming", requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit as string) || 5;
    const events = storage.getUpcomingEvents(limit);
    res.json(events.map(event => ({
      ...event,
      attendanceStatus: storage.getEventResponse(event.id, req.user!.id)?.status ?? null,
      matchResult: storage.getMatchResult(event.id) ?? null,
    })));
  });

  app.get("/api/events/:id", requireAuth, (req, res) => {
    const event = storage.getEvent(Number(req.params.id));
    if (!event) return res.status(404).json({ message: "Event nenájdený" });
    res.json({ ...event, matchResult: storage.getMatchResult(event.id) ?? null });
  });

  app.put("/api/events/:id/result", requireAdmin, (req, res) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isInteger(eventId)) return res.status(400).json({ message: "Neplatné ID zápasu" });
      const event = storage.getEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event nenájdený" });
      if (event.type !== "match") return res.status(400).json({ message: "Výsledok možno zapísať iba k zápasu" });
      const result = parseMatchResult(req.body);
      res.json(storage.upsertMatchResult(
        eventId,
        result.teamScore,
        result.opponentScore,
        result.notes,
        req.user!.id,
        result.players,
      ));
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Výsledok sa nepodarilo uložiť" });
    }
  });

  app.delete("/api/events/:id/result", requireAdmin, (req, res) => {
    try {
      const eventId = Number(req.params.id);
      if (!storage.getEvent(eventId)) return res.status(404).json({ message: "Event nenájdený" });
      if (!storage.deleteMatchResult(eventId)) return res.status(404).json({ message: "Výsledok nebol zapísaný" });
      res.json({ message: "Výsledok bol zmazaný" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Výsledok sa nepodarilo zmazať" });
    }
  });

  app.post("/api/events", requireAdmin, async (req, res) => {
    try {
      const data = insertEventSchema.parse({
        ...req.body,
        createdBy: req.user!.id,
      });
      const event = storage.createEvent(data);
      let googleSyncWarning: string | undefined;

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
        googleSyncWarning = "Event bol vytvorený, ale nepodarilo sa ho pridať do Google Calendar.";
      }

      res.status(201).json({ ...(storage.getEvent(event.id) ?? event), googleSyncWarning });
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
    if (event.type !== "match") storage.deleteMatchResult(event.id);

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

  // ============ TEAM ORGANIZATION ============
  app.get("/api/organization", requireAuth, (_req, res) => {
    res.json(storage.getTeamResponsibilities());
  });

  app.post("/api/organization", requireAdmin, (req, res) => {
    try {
      const { data, ownerIds } = parseTeamResponsibility(req.body);
      const responsibility = storage.createTeamResponsibility(data, ownerIds);
      res.status(201).json(responsibility);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Položku sa nepodarilo vytvoriť" });
    }
  });

  app.put("/api/organization/order", requireAdmin, (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
      if (ids.some((id: number) => !Number.isInteger(id))) {
        return res.status(400).json({ message: "Neplatné poradie položiek" });
      }
      storage.reorderTeamResponsibilities(ids);
      res.json({ message: "Poradie bolo uložené" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Poradie sa nepodarilo uložiť" });
    }
  });

  app.put("/api/organization/:id", requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Neplatné ID položky" });
      const { data, ownerIds } = parseTeamResponsibility(req.body);
      const responsibility = storage.updateTeamResponsibility(id, data, ownerIds);
      if (!responsibility) return res.status(404).json({ message: "Položka nebola nájdená" });
      res.json(responsibility);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Položku sa nepodarilo upraviť" });
    }
  });

  app.delete("/api/organization/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Neplatné ID položky" });
    if (!storage.deleteTeamResponsibility(id)) {
      return res.status(404).json({ message: "Položka nebola nájdená" });
    }
    res.json({ message: "Položka bola zmazaná" });
  });

  app.post("/api/organization/:id/remind", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Neplatné ID položky" });
    const responsibility = storage.getTeamResponsibility(id);
    if (!responsibility) return res.status(404).json({ message: "Položka nebola nájdená" });
    const recipientIds = responsibility.owners
      .filter(owner => {
        const recipient = storage.getUser(owner.id);
        return recipient?.isActive && recipient.emailVerified;
      })
      .map(owner => owner.id);
    if (recipientIds.length === 0) {
      return res.status(400).json({ message: "Najprv priraď aspoň jedného aktívneho člena s potvrdeným účtom" });
    }
    const reminderBody = responsibility.notes
      ? `${responsibility.notes.slice(0, 500)}${responsibility.notes.length > 500 ? "…" : ""}`
      : `Skontroluj položku „${responsibility.title}“ v tímovej organizácii.`;

    await notifyUsers(recipientIds, {
      title: `Pripomienka: ${responsibility.title}`,
      body: reminderBody,
      path: "/#/organization",
      tag: `organization-${responsibility.id}-${Date.now().toString(36)}`,
      emailSubject: `🔔 ${responsibility.title} | O5MY Futsal`,
      emailHeading: `Pripomienka: ${responsibility.title}`,
      emailButtonLabel: "Otvoriť organizáciu",
    });

    res.json({ message: "Pripomienka bola odoslaná", recipientCount: recipientIds.length });
  });

  app.post("/api/organization/:id/inventory", requireAdmin, (req, res) => {
    try {
      const responsibilityId = Number(req.params.id);
      const responsibility = Number.isInteger(responsibilityId) ? storage.getTeamResponsibility(responsibilityId) : undefined;
      if (!responsibility) return res.status(404).json({ message: "Inventár nebol nájdený" });
      if (responsibility.kind !== "inventory") {
        return res.status(400).json({ message: "Veci možno pridávať iba do inventára" });
      }
      res.status(201).json(storage.createTeamInventoryItem(parseTeamInventoryItem(req.body, responsibilityId)));
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Vec sa nepodarilo pridať" });
    }
  });

  app.put("/api/organization/:id/inventory/order", requireAdmin, (req, res) => {
    try {
      const responsibilityId = Number(req.params.id);
      if (!Number.isInteger(responsibilityId) || !storage.getTeamResponsibility(responsibilityId)) {
        return res.status(404).json({ message: "Inventár nebol nájdený" });
      }
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
      if (ids.some((id: number) => !Number.isInteger(id))) {
        return res.status(400).json({ message: "Neplatné poradie inventára" });
      }
      storage.reorderTeamInventoryItems(responsibilityId, ids);
      res.json({ message: "Poradie inventára bolo uložené" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Poradie inventára sa nepodarilo uložiť" });
    }
  });

  app.put("/api/organization/:id/inventory/:itemId", requireAdmin, (req, res) => {
    try {
      const responsibilityId = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      if (!Number.isInteger(responsibilityId) || !Number.isInteger(itemId)) {
        return res.status(400).json({ message: "Neplatné ID inventárnej položky" });
      }
      const { responsibilityId: _responsibilityId, ...item } = parseTeamInventoryItem(req.body, responsibilityId);
      const updated = storage.updateTeamInventoryItem(responsibilityId, itemId, item);
      if (!updated) return res.status(404).json({ message: "Vec nebola nájdená" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Vec sa nepodarilo upraviť" });
    }
  });

  app.delete("/api/organization/:id/inventory/:itemId", requireAdmin, (req, res) => {
    const responsibilityId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(responsibilityId) || !Number.isInteger(itemId)) {
      return res.status(400).json({ message: "Neplatné ID inventárnej položky" });
    }
    if (!storage.deleteTeamInventoryItem(responsibilityId, itemId)) {
      return res.status(404).json({ message: "Vec nebola nájdená" });
    }
    res.json({ message: "Vec bola zmazaná" });
  });

  // ============ PLAYER STATISTICS ============
  app.get("/api/statistics", requireAuth, (_req, res) => {
    res.json(storage.getPlayerStatistics());
  });

  app.patch("/api/statistics/:userId", requireAdmin, (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const goalsDelta = Number(req.body?.goalsDelta ?? 0);
      const assistsDelta = Number(req.body?.assistsDelta ?? 0);
      if (!Number.isInteger(userId)) return res.status(400).json({ message: "Neplatné ID hráča" });
      if (![-1, 0, 1].includes(goalsDelta) || ![-1, 0, 1].includes(assistsDelta) || (goalsDelta === 0 && assistsDelta === 0)) {
        return res.status(400).json({ message: "Naraz možno pridať alebo odobrať jeden gól či asistenciu" });
      }
      const statistic = storage.adjustPlayerStatistics(userId, goalsDelta, assistsDelta);
      if (!statistic) return res.status(404).json({ message: "Aktívny hráč nebol nájdený" });
      res.json(statistic);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Štatistiku sa nepodarilo upraviť" });
    }
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
