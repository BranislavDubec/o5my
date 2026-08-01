import {
  users, emailVerificationTokens, events, eventResponses, polls, pollOptions, pollVotes,
  payments, bankTransactions, notificationSettings, appSettings,
} from '@shared/schema';
import type {
  User, InsertUser, EmailVerificationToken,
  Event, InsertEvent,
  EventResponse, InsertEventResponse,
  Poll, InsertPoll,
  PollOption, InsertPollOption,
  PollVote, InsertPollVote,
  Payment, InsertPayment,
  BankTransaction,
  NotificationSettings, InsertNotificationSettings,
  AppSetting,
} from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc, asc, gte } from "drizzle-orm";

const sqlite = new Database(
  process.env.DATABASE_PATH || "data.db"
);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Auto-create tables on first run
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'player',
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    opponent TEXT,
    home_away TEXT,
    external_id TEXT,
    source TEXT NOT NULL DEFAULT 'local',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
`);

const userColumns = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (!userColumns.some(column => column.name === "email_verified")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  sqlite.exec("UPDATE users SET email_verified = 1");
}

sqlite.exec(`
  PRAGMA table_info(events);
`);

const eventColumns = sqlite.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
if (!eventColumns.some(column => column.name === "external_id")) {
  sqlite.exec("ALTER TABLE events ADD COLUMN external_id TEXT");
}
if (!eventColumns.some(column => column.name === "source")) {
  sqlite.exec("ALTER TABLE events ADD COLUMN source TEXT NOT NULL DEFAULT 'local'");
}

sqlite.exec(`

  CREATE TABLE IF NOT EXISTS event_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(event_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    closes_at TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS poll_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL REFERENCES polls(id),
    label TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS poll_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL REFERENCES polls(id),
    option_id INTEGER NOT NULL REFERENCES poll_options(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    UNIQUE(poll_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    variable_symbol TEXT,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bank_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT NOT NULL UNIQUE,
    amount INTEGER NOT NULL,
    date TEXT NOT NULL,
    payer_name TEXT,
    payer_iban TEXT,
    variable_symbol TEXT,
    constant_symbol TEXT,
    memo TEXT,
    matched_payment_id INTEGER REFERENCES payments(id),
    synced_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notification_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    push_enabled INTEGER NOT NULL DEFAULT 1,
    email_enabled INTEGER NOT NULL DEFAULT 1,
    push_subscription TEXT
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL
  );
`);

export interface IStorage {
  // Users
  getUser(id: number): User | undefined;
  getUserByEmail(email: string): User | undefined;
  getAllUsers(): User[];
  createUser(user: InsertUser): User;
  updateUserRole(id: number, role: string): User | undefined;
  markUserEmailVerified(id: number): User | undefined;
  deleteUser(id: number): void;

  // Email verification
  createEmailVerificationToken(userId: number, tokenHash: string, expiresAt: string): EmailVerificationToken;
  getEmailVerificationToken(tokenHash: string): EmailVerificationToken | undefined;
  deleteEmailVerificationTokens(userId: number): void;

  // Events
  getEvent(id: number): Event | undefined;
  getEventByExternalId(externalId: string, source: string): Event | undefined;
  getAllEvents(): Event[];
  getUpcomingEvents(limit?: number): Event[];
  createEvent(event: InsertEvent): Event;
  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined;
  deleteEvent(id: number): void;

  // Event Responses
  getEventResponse(eventId: number, userId: number): EventResponse | undefined;
  getEventResponses(eventId: number): (EventResponse & { user: Pick<User, 'id' | 'name'> })[];
  upsertEventResponse(response: InsertEventResponse): void;

  // Polls
  getPoll(id: number): Poll | undefined;
  getAllPolls(): Poll[];
  createPoll(poll: InsertPoll): Poll;
  deletePoll(id: number): void;

  // Poll Options
  getPollOptions(pollId: number): PollOption[];
  createPollOption(option: InsertPollOption): PollOption;
  createPollOptions(options: InsertPollOption[]): void;

  // Poll Votes
  getPollVotes(pollId: number): (PollVote & { user: Pick<User, 'id' | 'name'> })[];
  getUserPollVote(pollId: number, userId: number): PollVote | undefined;
  upsertPollVote(vote: InsertPollVote): void;

  // Payments
  getPayment(id: number): Payment | undefined;
  getPaymentsByUser(userId: number): Payment[];
  getAllPayments(): (Payment & { user: Pick<User, 'id' | 'name'> })[];
  createPayment(payment: InsertPayment): Payment;
  updatePaymentStatus(id: number, status: string): Payment | undefined;
  deletePayment(id: number): void;
  getPendingPaymentsByVariableSymbol(vs: string): Payment[];

  // Bank Transactions
  getAllBankTransactions(limit?: number): BankTransaction[];
  getUnmatchedBankTransactions(): BankTransaction[];
  createBankTransaction(tx: Omit<BankTransaction, 'id'>): BankTransaction | undefined;
  updateBankTransactionMatch(id: number, paymentId: number | null): void;

  // Notification Settings
  getNotificationSettings(userId: number): NotificationSettings | undefined;
  upsertNotificationSettings(settings: Partial<InsertNotificationSettings> & { userId: number }): void;

  // App Settings
  getAppSetting(key: string): string | undefined;
  setAppSetting(key: string, value: string): void;
}

function normalizeEventTime(value?: string | null) {
  if (!value) return value ?? null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

function normalizeEventData(event: Partial<InsertEvent>) {
  const normalized: Partial<InsertEvent> = { ...event };
  if (typeof normalized.startTime === "string") {
    normalized.startTime = normalizeEventTime(normalized.startTime) as string;
  }
  if (typeof normalized.endTime === "string") {
    normalized.endTime = normalizeEventTime(normalized.endTime) as string;
  }
  return normalized;
}

export class DatabaseStorage implements IStorage {
  // ============ USERS ============
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

  markUserEmailVerified(id: number): User | undefined {
    return db.update(users).set({ emailVerified: true }).where(eq(users.id, id)).returning().get();
  }

  deleteUser(id: number): void {
    this.deleteEmailVerificationTokens(id);
    db.delete(users).where(eq(users.id, id)).run();
  }

  // ============ EMAIL VERIFICATION ============
  createEmailVerificationToken(userId: number, tokenHash: string, expiresAt: string): EmailVerificationToken {
    this.deleteEmailVerificationTokens(userId);
    return db.insert(emailVerificationTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning()
      .get();
  }

  getEmailVerificationToken(tokenHash: string): EmailVerificationToken | undefined {
    return db.select().from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .get();
  }

  deleteEmailVerificationTokens(userId: number): void {
    db.delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))
      .run();
  }

  // ============ EVENTS ============
  getEvent(id: number): Event | undefined {
    return db.select().from(events).where(eq(events.id, id)).get();
  }

  getEventByExternalId(externalId: string, source: string): Event | undefined {
    return db.select().from(events)
      .where(and(eq(events.externalId, externalId), eq(events.source, source)))
      .get();
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
    db.delete(eventResponses).where(eq(eventResponses.eventId, id)).run();
    db.delete(events).where(eq(events.id, id)).run();
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

  // ============ PAYMENTS ============
  getPayment(id: number): Payment | undefined {
    return db.select().from(payments).where(eq(payments.id, id)).get();
  }

  getPaymentsByUser(userId: number): Payment[] {
    return db.select().from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.dueDate))
      .all();
  }

  getAllPayments(): (Payment & { user: Pick<User, 'id' | 'name'> })[] {
    const allPayments = db.select().from(payments).orderBy(desc(payments.dueDate)).all();
    return allPayments.map(p => {
      const user = db.select().from(users).where(eq(users.id, p.userId)).get();
      return { ...p, user: { id: user!.id, name: user!.name } };
    });
  }

  createPayment(payment: InsertPayment): Payment {
    return db.insert(payments).values(payment).returning().get();
  }

  updatePaymentStatus(id: number, status: string): Payment | undefined {
    return db.update(payments)
      .set({ status })
      .where(eq(payments.id, id))
      .returning()
      .get();
  }

  deletePayment(id: number): void {
    db.delete(payments).where(eq(payments.id, id)).run();
  }

  getPendingPaymentsByVariableSymbol(vs: string): Payment[] {
    return db.select().from(payments)
      .where(and(eq(payments.variableSymbol, vs), eq(payments.status, "pending")))
      .all();
  }

  // ============ BANK TRANSACTIONS ============
  getAllBankTransactions(limit = 50): BankTransaction[] {
    return db.select().from(bankTransactions)
      .orderBy(desc(bankTransactions.date))
      .limit(limit)
      .all();
  }

  getUnmatchedBankTransactions(): BankTransaction[] {
    return db.select().from(bankTransactions)
      .all()
      .filter(tx => tx.matchedPaymentId === null);
  }

  createBankTransaction(tx: Omit<BankTransaction, 'id'>): BankTransaction | undefined {
    // Check if transaction already exists (by transactionId)
    const existing = db.select().from(bankTransactions)
      .where(eq(bankTransactions.transactionId, tx.transactionId))
      .get();
    if (existing) return undefined;

    return db.insert(bankTransactions).values(tx).returning().get();
  }

  updateBankTransactionMatch(id: number, paymentId: number | null): void {
    db.update(bankTransactions)
      .set({ matchedPaymentId: paymentId })
      .where(eq(bankTransactions.id, id))
      .run();
  }

  // ============ NOTIFICATION SETTINGS ============
  getNotificationSettings(userId: number): NotificationSettings | undefined {
    return db.select().from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .get();
  }

  upsertNotificationSettings(settings: Partial<InsertNotificationSettings> & { userId: number }): void {
    const existing = this.getNotificationSettings(settings.userId);
    if (existing) {
      db.update(notificationSettings)
        .set(settings)
        .where(eq(notificationSettings.id, existing.id))
        .run();
    } else {
      db.insert(notificationSettings).values({
        userId: settings.userId,
        pushEnabled: settings.pushEnabled ?? true,
        emailEnabled: settings.emailEnabled ?? true,
        pushSubscription: settings.pushSubscription,
      }).run();
    }
  }

  // ============ APP SETTINGS ============
  getAppSetting(key: string): string | undefined {
    const setting = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
    return setting?.value;
  }

  setAppSetting(key: string, value: string): void {
    const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
    if (existing) {
      db.update(appSettings).set({ value }).where(eq(appSettings.id, existing.id)).run();
    } else {
      db.insert(appSettings).values({ key, value }).run();
    }
  }
}

export const storage = new DatabaseStorage();
