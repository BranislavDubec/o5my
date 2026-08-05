import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../auth";
import { insertEventSchema } from "@shared/schema";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  updateGoogleCalendarEventAttendance,
} from "../google-calendar";
import { getUserEventDescription } from "../google-event-description";

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

export function registerEventsRoutes(app: Express) {
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
      description: typeof body.description === "string" ? getUserEventDescription(body.description) : null,
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
}
