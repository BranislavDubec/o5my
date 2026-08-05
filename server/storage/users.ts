import { eq, asc } from "drizzle-orm";
import {
  users,
  playerStatistics,
  matchPlayerStatistics,
} from '@shared/schema';
import type {
  User,
  InsertUser,
  PlayerStatistic,
  MatchPlayerStatistic,
} from '@shared/schema';
import { db } from "./db";
import type { PlayerStatisticSummary } from "./types";

export class UsersStore {
  getUser(id: number): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  getUserByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email)).get();
  }

  getAllUsers(): User[] {
    return db.select().from(users).orderBy(asc(users.name)).all();
  }

  createUser(insertUser: InsertUser): User {
    return db.insert(users).values(insertUser).returning().get();
  }

  updateUserRole(id: number, role: string): User | undefined {
    return db.update(users).set({ role }).where(eq(users.id, id)).returning().get();
  }

  updateUserActiveStatus(id: number, isActive: boolean): User | undefined {
    return db.update(users).set({ isActive }).where(eq(users.id, id)).returning().get();
  }

  updateUserTheme(id: number, theme: "light" | "dark"): User | undefined {
    return db.update(users).set({ theme }).where(eq(users.id, id)).returning().get();
  }

  updateUserProfile(id: number, firstName: string, lastName: string, nickname: string): User | undefined {
    return db.update(users)
      .set({ firstName, lastName, nickname, name: `${firstName} ${lastName}` })
      .where(eq(users.id, id))
      .returning()
      .get();
  }

  updateUserPassword(id: number, password: string): User | undefined {
    return db.transaction(tx => {
      const existing = tx.select().from(users).where(eq(users.id, id)).get();
      if (!existing) return undefined;
      return tx.update(users)
        .set({ password, passwordVersion: existing.passwordVersion + 1 })
        .where(eq(users.id, id))
        .returning()
        .get();
    });
  }

  markUserEmailVerified(id: number): User | undefined {
    return db.update(users).set({ emailVerified: true }).where(eq(users.id, id)).returning().get();
  }

  // ============ PLAYER STATISTICS ============
  getPlayerStatistics(): PlayerStatisticSummary[] {
    const statisticsByUser = new Map<number, PlayerStatistic>(
      db.select().from(playerStatistics).all().map(statistic => [statistic.userId, statistic]),
    );
    return this.getAllUsers()
      .filter(user => user.isActive && user.emailVerified)
      .map(user => {
        const statistic = statisticsByUser.get(user.id);
        return {
          userId: user.id,
          name: user.name,
          goals: statistic?.goals ?? 0,
          assists: statistic?.assists ?? 0,
          updatedAt: statistic?.updatedAt ?? null,
        };
      })
      .sort((first, second) => second.goals - first.goals || second.assists - first.assists || first.name.localeCompare(second.name, "sk"));
  }

  adjustPlayerStatistics(userId: number, goalsDelta: number, assistsDelta: number): PlayerStatisticSummary | undefined {
    const user = this.getUser(userId);
    if (!user?.isActive || !user.emailVerified) return undefined;
    const statistic = db.transaction(tx => {
      const existing = tx.select().from(playerStatistics).where(eq(playerStatistics.userId, userId)).get();
      const goals = (existing?.goals ?? 0) + goalsDelta;
      const assists = (existing?.assists ?? 0) + assistsDelta;
      if (goals < 0 || assists < 0) throw new Error("Štatistika nemôže byť záporná");
      const trackedContributions = tx.select().from(matchPlayerStatistics)
        .where(eq(matchPlayerStatistics.userId, userId))
        .all() as MatchPlayerStatistic[];
      const trackedGoals = trackedContributions.reduce((sum, contribution) => sum + contribution.goals, 0);
      const trackedAssists = trackedContributions.reduce((sum, contribution) => sum + contribution.assists, 0);
      if (goals < trackedGoals || assists < trackedAssists) {
        throw new Error("Štatistiku nemožno znížiť pod súčet zapísaný vo výsledkoch zápasov");
      }
      if (goals > 10_000 || assists > 10_000) throw new Error("Štatistika je príliš vysoká");
      const updatedAt = new Date().toISOString();
      if (existing) {
        return tx.update(playerStatistics)
          .set({ goals, assists, updatedAt })
          .where(eq(playerStatistics.id, existing.id))
          .returning()
          .get();
      }
      return tx.insert(playerStatistics)
        .values({ userId, goals, assists, updatedAt })
        .returning()
        .get();
    });
    return { userId, name: user.name, goals: statistic.goals, assists: statistic.assists, updatedAt: statistic.updatedAt };
  }
}
