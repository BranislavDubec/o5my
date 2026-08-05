import { eq, and, desc } from "drizzle-orm";
import {
  users,
  polls,
  pollOptions,
  pollVotes,
} from '@shared/schema';
import type {
  User,
  Poll,
  InsertPoll,
  PollOption,
  InsertPollOption,
  PollVote,
  InsertPollVote,
} from '@shared/schema';
import { db } from "./db";

export class PollsStore {
  // ============ POLLS ============
  getPoll(id: number): Poll | undefined {
    return db.select().from(polls).where(eq(polls.id, id)).get();
  }

  getAllPolls(): Poll[] {
    return db.select().from(polls).orderBy(desc(polls.createdAt)).all();
  }

  createPoll(poll: InsertPoll): Poll {
    return db.insert(polls).values(poll).returning().get();
  }

  deletePoll(id: number): void {
    db.delete(pollVotes).where(eq(pollVotes.pollId, id)).run();
    db.delete(pollOptions).where(eq(pollOptions.pollId, id)).run();
    db.delete(polls).where(eq(polls.id, id)).run();
  }

  // ============ POLL OPTIONS ============
  getPollOptions(pollId: number): PollOption[] {
    return db.select().from(pollOptions).where(eq(pollOptions.pollId, pollId)).all();
  }

  createPollOption(option: InsertPollOption): PollOption {
    return db.insert(pollOptions).values(option).returning().get();
  }

  createPollOptions(options: InsertPollOption[]): void {
    if (options.length > 0) {
      db.insert(pollOptions).values(options).run();
    }
  }

  // ============ POLL VOTES ============
  getPollVotes(pollId: number): (PollVote & { user: Pick<User, 'id' | 'name'> })[] {
    const votes = db.select().from(pollVotes)
      .where(eq(pollVotes.pollId, pollId))
      .all();
    return votes.map(v => {
      const user = db.select().from(users).where(eq(users.id, v.userId)).get();
      return { ...v, user: { id: user!.id, name: user!.name } };
    });
  }

  getUserPollVote(pollId: number, userId: number): PollVote | undefined {
    return db.select().from(pollVotes)
      .where(and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, userId)))
      .get();
  }

  upsertPollVote(vote: InsertPollVote): void {
    const existing = this.getUserPollVote(vote.pollId, vote.userId);
    if (existing) {
      db.update(pollVotes)
        .set({ optionId: vote.optionId })
        .where(eq(pollVotes.id, existing.id))
        .run();
    } else {
      db.insert(pollVotes).values(vote).run();
    }
  }
}
