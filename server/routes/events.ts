import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireManager } from "../auth";
import { insertEventSchema } from "@shared/schema";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  updateGoogleCalendarEventAttendance,
} from "../google-calendar";
import { getUserEventDescription } from "../google-event-description";

function parseMatchResult(body: unknown, existingPlayerIds: ReadonlySet<number> = new Set()) {
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
      played: player.played === true,
    };
  });

  // Keep players who have stats OR played (attendance)
  const playersWithData = players.filter(player => player.goals > 0 || player.assists > 0 || player.played);

  if (new Set(playersWithData.map(player => player.userId)).size !== playersWithData.length) {
    throw new Error("Každý hráč môže byť vo výsledku iba raz");
  }
  if (playersWithData.some(player => {
    const user = storage.getUser(player.userId);
    if (!user) return true;
    // Keep historical match participants editable after their player/account
    // status changes, but never allow an inactive player to be newly added.
    if (existingPlayerIds.has(player.userId)) return false;
    return !user.isActive || !user.isPlayerActive || !user.emailVerified;
  })) {
    throw new Error("Do výsledku možno pridať iba aktívnych overených hráčov");
  }
  if (playersWithData.reduce((sum, player) => sum + player.goals, 0) > teamScore) {
    throw new Error("Súčet gólov hráčov nemôže byť vyšší ako skóre O5MY");
  }
  if (playersWithData.reduce((sum, player) => sum + player.assists, 0) > teamScore) {
    throw new Error("Súčet asistencií nemôže byť vyšší ako skóre O5MY");
  }

  return { teamScore, opponentScore, notes: notes || null, players: playersWithData };
}

function hasEventStarted(event: { startTime: string }) {
  const startTime = new Date(event.startTime).getTime();
  return Number.isFinite(startTime) && startTime <= Date.now();
}

function canUserRespondToAttendance(event: { type: string }, userId: number) {
  if (event.type !== "match") return true;
  const user = storage.getUser(userId);
  return user?.isActive === true && user.isPlayerActive && user.emailVerified;
}

function getVisibleEventResponses(event: { id: number; type: string; startTime: string }) {
  const responses = storage.getEventResponses(event.id);
  if (event.type !== "match" || hasEventStarted(event)) return responses;
  return responses.filter(response => {
    const user = storage.getUser(response.userId);
    return user?.isActive === true && user.isPlayerActive && user.emailVerified;
  });
}

function getVisibleAttendanceStatus(event: { id: number; type: string; startTime: string }, userId: number) {
  const storedStatus = storage.getEventResponse(event.id, userId)?.status ?? null;
  if (canUserRespondToAttendance(event, userId)) return storedStatus;
  if (hasEventStarted(event) && storedStatus) return storedStatus;
  return "not_applicable";
}

// Resolves the opponents table link for a match event. An explicit
// opponentId wins; otherwise the free-text opponent name is matched against
// existing opponents (case-insensitive) so matches created before the link
// existed still get connected.
function resolveOpponentId(body: Record<string, unknown>): number | null {
  const explicitId = Number(body.opponentId);
  if (Number.isInteger(explicitId) && explicitId > 0) {
    return storage.getOpponent(explicitId) ? explicitId : null;
  }
  if (typeof body.opponent === "string" && body.opponent.trim()) {
    const name = body.opponent.trim().toLowerCase();
    const match = storage.getAllOpponents().find(opponent =>
      opponent.name.trim().toLowerCase() === name,
    );
    if (match) return match.id;
  }
  return null;
}

export function registerEventsRoutes(app: Express) {
  // ============ EVENTS ============
  app.get("/api/events", requireAuth, (req, res) => {
    const allEvents = storage.getAllEvents();
    res.json(allEvents.map(event => ({
      ...event,
      attendanceStatus: getVisibleAttendanceStatus(event, req.user!.id),
      canRespondToAttendance: canUserRespondToAttendance(event, req.user!.id),
      matchResult: storage.getMatchResult(event.id) ?? null,
    })));
  });

  app.get("/api/events/upcoming", requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit as string) || 5;
    const events = storage.getUpcomingEvents(limit);
    res.json(events.map(event => ({
      ...event,
      attendanceStatus: getVisibleAttendanceStatus(event, req.user!.id),
      canRespondToAttendance: canUserRespondToAttendance(event, req.user!.id),
      matchResult: storage.getMatchResult(event.id) ?? null,
    })));
  });

  app.get("/api/events/:id", requireAuth, (req, res) => {
    const event = storage.getEvent(Number(req.params.id));
    if (!event) return res.status(404).json({ message: "Event nenájdený" });
    res.json({
      ...event,
      attendanceStatus: getVisibleAttendanceStatus(event, req.user!.id),
      canRespondToAttendance: canUserRespondToAttendance(event, req.user!.id),
      matchResult: storage.getMatchResult(event.id) ?? null,
    });
  });

  app.put("/api/events/:id/result", requireManager, (req, res) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isInteger(eventId)) return res.status(400).json({ message: "Neplatné ID zápasu" });
      const event = storage.getEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event nenájdený" });
      if (event.type !== "match") return res.status(400).json({ message: "Výsledok možno zapísať iba k zápasu" });
      const existingPlayerIds = new Set(
        storage.getMatchResult(eventId)?.players.map(player => player.userId) ?? [],
      );
      const result = parseMatchResult(req.body, existingPlayerIds);
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

  app.delete("/api/events/:id/result", requireManager, (req, res) => {
    try {
      const eventId = Number(req.params.id);
      if (!storage.getEvent(eventId)) return res.status(404).json({ message: "Event nenájdený" });
      if (!storage.deleteMatchResult(eventId)) return res.status(404).json({ message: "Výsledok nebol zapísaný" });
      res.json({ message: "Výsledok bol zmazaný" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Výsledok sa nepodarilo zmazať" });
    }
  });

  app.post("/api/events", requireManager, async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const data = insertEventSchema.parse({
        ...body,
        opponentId: body.type === "match" ? resolveOpponentId(body) : null,
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

  app.put("/api/events/:id", requireManager, async (req, res) => {
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
      opponentId: body.type === "match" ? resolveOpponentId(body) : null,
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
        const hasStoredResponses = storage.getEventResponses(event.id).length > 0;
        const responses = getVisibleEventResponses(event);
        if (hasStoredResponses) {
          await updateGoogleCalendarEventAttendance(event, responses);
        }
      } catch (googleErr: any) {
        console.error("Failed to update Google Calendar event", googleErr.message || googleErr);
        googleSyncWarning = "Event bol uložený, ale Google Calendar sa nepodarilo aktualizovať.";
      }
    }

    res.json({
      ...event,
      attendanceStatus: getVisibleAttendanceStatus(event, req.user!.id),
      canRespondToAttendance: canUserRespondToAttendance(event, req.user!.id),
      matchResult: storage.getMatchResult(event.id) ?? null,
      googleSyncWarning,
    });
  });

  app.delete("/api/events/:id", requireManager, async (req, res) => {
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
    const event = storage.getEvent(Number(req.params.id));
    if (!event) return res.status(404).json({ message: "Event nenájdený" });
    res.json(getVisibleEventResponses(event));
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
    if (!canUserRespondToAttendance(event, req.user!.id)) {
      return res.status(403).json({ message: "Na zápas môžu reagovať iba aktívni hráči" });
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
        const responses = getVisibleEventResponses(event);
        await updateGoogleCalendarEventAttendance(event, responses);
      } catch (googleErr: any) {
        console.error("Failed to update Google Calendar attendance", googleErr.message || googleErr);
      }
    })();
  });
}
