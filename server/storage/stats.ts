import { eq } from "drizzle-orm";
import { events, matchResults } from '@shared/schema';
import { db } from "./db";
import type {
  MatchOutcome,
  TeamRecentResult,
  TeamStatisticSummary,
  TeamVenueStats,
} from "./types";

function emptyVenueStats(): TeamVenueStats {
  return { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
}

function outcomeOf(teamScore: number, opponentScore: number): MatchOutcome {
  if (teamScore > opponentScore) return "W";
  if (teamScore < opponentScore) return "L";
  return "D";
}

interface ResultRow {
  eventId: number;
  startTime: string;
  opponent: string | null;
  homeAway: string | null;
  teamScore: number;
  opponentScore: number;
  outcome: MatchOutcome;
}

export class StatsStore {
  // Aggregates team statistics from match results + events.
  getTeamStatistics(): TeamStatisticSummary {
    const rows = db.select({
      eventId: matchResults.eventId,
      type: events.type,
      startTime: events.startTime,
      opponent: events.opponent,
      homeAway: events.homeAway,
      teamScore: matchResults.teamScore,
      opponentScore: matchResults.opponentScore,
    })
      .from(matchResults)
      .innerJoin(events, eq(matchResults.eventId, events.id))
      .all();

    const matches: ResultRow[] = rows
      .filter(row => row.type === "match")
      .map(row => ({
        eventId: row.eventId,
        startTime: row.startTime,
        opponent: row.opponent,
        homeAway: row.homeAway,
        teamScore: row.teamScore,
        opponentScore: row.opponentScore,
        outcome: outcomeOf(row.teamScore, row.opponentScore),
      }))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    const total = matches.length;
    const wins = matches.filter(match => match.outcome === "W").length;
    const draws = matches.filter(match => match.outcome === "D").length;
    const losses = matches.filter(match => match.outcome === "L").length;
    const goalsFor = matches.reduce((sum, match) => sum + match.teamScore, 0);
    const goalsAgainst = matches.reduce((sum, match) => sum + match.opponentScore, 0);

    const home: TeamVenueStats = emptyVenueStats();
    const away: TeamVenueStats = emptyVenueStats();
    for (const match of matches) {
      const venue = match.homeAway === "home" ? home : match.homeAway === "away" ? away : null;
      if (!venue) continue;
      venue.played += 1;
      if (match.outcome === "W") venue.wins += 1;
      else if (match.outcome === "D") venue.draws += 1;
      else venue.losses += 1;
      venue.goalsFor += match.teamScore;
      venue.goalsAgainst += match.opponentScore;
    }

    const form = matches.slice(-5).reverse().map(match => match.outcome);

    let biggestWin: TeamRecentResult | null = null;
    let biggestLoss: TeamRecentResult | null = null;
    for (const match of matches) {
      const winMargin = match.teamScore - match.opponentScore;
      const lossMargin = match.opponentScore - match.teamScore;
      if (match.outcome === "W" && (!biggestWin || winMargin > biggestWin.teamScore - biggestWin.opponentScore)) {
        biggestWin = match;
      }
      if (match.outcome === "L" && (!biggestLoss || lossMargin > biggestLoss.opponentScore - biggestLoss.teamScore)) {
        biggestLoss = match;
      }
    }

    return {
      totalMatches: total,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : null,
      goalsPerMatch: total > 0 ? Math.round((goalsFor / total) * 100) / 100 : null,
      goalsAgainstPerMatch: total > 0 ? Math.round((goalsAgainst / total) * 100) / 100 : null,
      form,
      home,
      away,
      biggestWin,
      biggestLoss,
      recentResults: [...matches].reverse().slice(0, 10),
    };
  }
}
