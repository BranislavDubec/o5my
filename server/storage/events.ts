import { eq, and } from "drizzle-orm";
import {
  users,
  events,
  matchResults,
  matchPlayerStatistics,
  eventResponses,
} from '@shared/schema';
import type {
  User,
  Event,
  InsertEvent,
  MatchResult,
  MatchPlayerStatistic,
  EventResponse,
  InsertEventResponse,
} from '@shared/schema';
import { db } from "./db";
import type { MatchResultWithPlayers, MatchPlayerContributionInput } from "./types";
import { normalizeEventData, applyPlayerStatisticDelta, deleteMatchResultInTransaction } from "./helpers";

export class EventsStore {
  // ============ EVENTS ============
  getEvent(id: number): Event | undefined {
    return db.select().from(events).where(eq(events.id, id)).get();
  }

  getEventsByExternalId(externalId: string): Event[] {
    return db.select().from(events)
      .where(eq(events.externalId, externalId))
      .all();
  }

  getAllEvents(): Event[] {
    return db.select().from(events).all().sort((a, b) => {
      const aTime = new Date(a.startTime).getTime();
      const bTime = new Date(b.startTime).getTime();
      return Number.isNaN(aTime) ? 1 : Number.isNaN(bTime) ? -1 : aTime - bTime;
    });
  }

  getUpcomingEvents(limit = 10): Event[] {
    const now = new Date().getTime();
    return db.select().from(events).all()
      .filter(event => new Date(event.startTime).getTime() >= now)
      .sort((a, b) => {
        const aTime = new Date(a.startTime).getTime();
        const bTime = new Date(b.startTime).getTime();
        return Number.isNaN(aTime) ? 1 : Number.isNaN(bTime) ? -1 : aTime - bTime;
      })
      .slice(0, limit);
  }

  createEvent(event: InsertEvent): Event {
    const normalizedEvent = normalizeEventData(event);
    return db.insert(events).values(normalizedEvent as InsertEvent).returning().get();
  }

  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined {
    const normalizedData = normalizeEventData(data);
    return db.update(events).set(normalizedData).where(eq(events.id, id)).returning().get();
  }

  deleteEvent(id: number): void {
    db.transaction(tx => {
      deleteMatchResultInTransaction(tx, id);
      tx.delete(eventResponses).where(eq(eventResponses.eventId, id)).run();
      tx.delete(events).where(eq(events.id, id)).run();
    });
  }

  // ============ MATCH RESULTS ============
  getMatchResult(eventId: number): MatchResultWithPlayers | undefined {
    const result = db.select().from(matchResults).where(eq(matchResults.eventId, eventId)).get();
    if (!result) return undefined;
    const players = db.select().from(matchPlayerStatistics)
      .where(eq(matchPlayerStatistics.eventId, eventId))
      .all()
      .map(contribution => {
        const user = db.select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.id, contribution.userId))
          .get();
        return {
          ...contribution,
          user: { id: contribution.userId, name: user?.name ?? "Neznámy hráč" },
        };
      })
      .sort((first, second) => second.goals - first.goals || second.assists - first.assists || first.user.name.localeCompare(second.user.name, "sk"));
    return { ...result, players };
  }

  upsertMatchResult(
    eventId: number,
    teamScore: number,
    opponentScore: number,
    notes: string | null,
    updatedBy: number,
    players: MatchPlayerContributionInput[],
  ): MatchResultWithPlayers {
    db.transaction(tx => {
      const existingResult = tx.select().from(matchResults).where(eq(matchResults.eventId, eventId)).get() as MatchResult | undefined;
      const existingPlayers = tx.select().from(matchPlayerStatistics)
        .where(eq(matchPlayerStatistics.eventId, eventId))
        .all() as MatchPlayerStatistic[];
      const previousByUser = new Map(existingPlayers.map(player => [player.userId, player]));
      const nextByUser = new Map(players.map(player => [player.userId, player]));
      const userIds = new Set([...Array.from(previousByUser.keys()), ...Array.from(nextByUser.keys())]);
      const updatedAt = new Date().toISOString();

      userIds.forEach(userId => {
        const previous = previousByUser.get(userId);
        const next = nextByUser.get(userId);
        applyPlayerStatisticDelta(
          tx,
          userId,
          (next?.goals ?? 0) - (previous?.goals ?? 0),
          (next?.assists ?? 0) - (previous?.assists ?? 0),
          updatedAt,
        );
      });

      if (existingResult) {
        tx.update(matchResults)
          .set({ teamScore, opponentScore, notes, updatedBy, updatedAt })
          .where(eq(matchResults.id, existingResult.id))
          .run();
      } else {
        tx.insert(matchResults).values({
          eventId,
          teamScore,
          opponentScore,
          notes,
          updatedBy,
          createdAt: updatedAt,
          updatedAt,
        }).run();
      }

      tx.delete(matchPlayerStatistics).where(eq(matchPlayerStatistics.eventId, eventId)).run();
      players.forEach(player => {
        tx.insert(matchPlayerStatistics).values({
          eventId,
          userId: player.userId,
          goals: player.goals,
          assists: player.assists,
          played: player.played,
          createdAt: updatedAt,
          updatedAt,
        }).run();
      });
    });

    return this.getMatchResult(eventId)!;
  }

  deleteMatchResult(eventId: number): boolean {
    return db.transaction(tx => deleteMatchResultInTransaction(tx, eventId));
  }

  // ============ EVENT RESPONSES ============
  getEventResponse(eventId: number, userId: number): EventResponse | undefined {
    return db.select().from(eventResponses)
      .where(and(eq(eventResponses.eventId, eventId), eq(eventResponses.userId, userId)))
      .get();
  }

  getEventResponses(eventId: number): (EventResponse & { user: Pick<User, 'id' | 'name'> })[] {
    const responses = db.select().from(eventResponses)
      .where(eq(eventResponses.eventId, eventId))
      .all();
    return responses.map(r => {
      const user = db.select().from(users).where(eq(users.id, r.userId)).get();
      return { ...r, user: { id: user!.id, name: user!.name } };
    });
  }

  upsertEventResponse(response: InsertEventResponse): void {
    const existing = this.getEventResponse(response.eventId, response.userId);
    if (existing) {
      db.update(eventResponses)
        .set({ status: response.status, note: response.note })
        .where(eq(eventResponses.id, existing.id))
        .run();
    } else {
      db.insert(eventResponses).values(response).run();
    }
  }
}
