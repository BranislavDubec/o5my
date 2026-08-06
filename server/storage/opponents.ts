import { eq, asc, and, or, isNull, desc } from "drizzle-orm";
import { opponents, events, matchResults } from '@shared/schema';
import type {
  Opponent,
  InsertOpponent,
  UpdateOpponent,
} from '@shared/schema';
import type { OpponentMatchSummary } from "./types";
import { db } from "./db";

export class OpponentsStore {
  getAllOpponents(): Opponent[]{
    return db.select().from(opponents).orderBy(asc(opponents.name)).all();
  }

  getOpponent(id: number): Opponent | undefined {
    return db.select().from(opponents).where(eq(opponents.id, id)).get();
  }

  createOpponent(opponent: InsertOpponent): Opponent {
    return db.insert(opponents).values(opponent).returning().get();
}
  updateOpponent(
  id: number,
  data: UpdateOpponent,
): Opponent | undefined {
  return db.update(opponents).set(data).where(eq(opponents.id, id)).returning().get();  
}
  deleteOpponent(id: number): void {
    db.delete(opponents).where(eq(opponents.id, id)).run();
  }

  // Matches played against an opponent. Prefers the explicit opponent_id link,
  // and falls back to matching the legacy free-text name so existing matches
  // (created before the link existed) still show up.
  getOpponentMatches(
    opponentId: number,
    opponentName: string,
  ): OpponentMatchSummary[] {
    return db.select({
      eventId: events.id,
      startTime: events.startTime,
      homeAway: events.homeAway,
      opponent: events.opponent,
      teamScore: matchResults.teamScore,
      opponentScore: matchResults.opponentScore,
    })
      .from(events)
      .leftJoin(matchResults, eq(matchResults.eventId, events.id))
      .where(and(
        eq(events.type, "match"),
        or(
          eq(events.opponentId, opponentId),
          and(isNull(events.opponentId), eq(events.opponent, opponentName)),
        ),
      ))
      .orderBy(desc(events.startTime))
      .all();
  }
}
