import {
  users, playerStatistics, emailVerificationTokens, passwordResetTokens, events, matchResults, matchPlayerStatistics, eventResponses, polls, pollOptions, pollVotes,
  payments, bankTransactions, walletTransactions, cashTransactions, notificationSettings, pushSubscriptions, appSettings, teamResponsibilities,
  teamResponsibilityOwners, teamInventoryItems,
  mediaCollections, mediaFiles,
} from '@shared/schema';
import type {
  User, InsertUser, PlayerStatistic, EmailVerificationToken, PasswordResetToken,
  Event, InsertEvent, MatchResult, MatchPlayerStatistic,
  EventResponse, InsertEventResponse,
  Poll, InsertPoll,
  PollOption, InsertPollOption,
  PollVote, InsertPollVote,
  Payment, InsertPayment,
  BankTransaction, WalletTransaction, InsertWalletTransaction,
  CashTransaction, InsertCashTransaction,
  NotificationSettings, InsertNotificationSettings,
  PushSubscriptionRecord,
  AppSetting, TeamResponsibility, InsertTeamResponsibility,
  TeamInventoryItem, InsertTeamInventoryItem,
  MediaCollection, MediaFile,
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
    first_name TEXT,
    last_name TEXT,
    nickname TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'player',
    is_active INTEGER NOT NULL DEFAULT 1,
    theme TEXT NOT NULL DEFAULT 'light',
    email_verified INTEGER NOT NULL DEFAULT 0,
    password_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS player_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    goals INTEGER NOT NULL DEFAULT 0,
    assists INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
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

  CREATE TABLE IF NOT EXISTS match_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL UNIQUE REFERENCES events(id),
    team_score INTEGER NOT NULL,
    opponent_score INTEGER NOT NULL,
    notes TEXT,
    updated_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS match_player_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    goals INTEGER NOT NULL DEFAULT 0,
    assists INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(event_id, user_id)
  );
`);

const userColumns = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (!userColumns.some(column => column.name === "email_verified")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  sqlite.exec("UPDATE users SET email_verified = 1");
}
if (!userColumns.some(column => column.name === "is_active")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
}
if (!userColumns.some(column => column.name === "theme")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'");
}
if (!userColumns.some(column => column.name === "nickname")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN nickname TEXT");
}
if (!userColumns.some(column => column.name === "first_name")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN first_name TEXT");
  sqlite.exec(`
    UPDATE users
    SET first_name = CASE
      WHEN INSTR(TRIM(name), ' ') > 0 THEN SUBSTR(TRIM(name), 1, INSTR(TRIM(name), ' ') - 1)
      ELSE TRIM(name)
    END
    WHERE first_name IS NULL
  `);
}
if (!userColumns.some(column => column.name === "last_name")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN last_name TEXT");
  sqlite.exec(`
    UPDATE users
    SET last_name = CASE
      WHEN INSTR(TRIM(name), ' ') > 0 THEN TRIM(SUBSTR(TRIM(name), INSTR(TRIM(name), ' ') + 1))
      ELSE ''
    END
    WHERE last_name IS NULL
  `);
}
if (!userColumns.some(column => column.name === "password_version")) {
  sqlite.exec("ALTER TABLE users ADD COLUMN password_version INTEGER NOT NULL DEFAULT 0");
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

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
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
    wallet_applied_amount INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    bank_transaction_id INTEGER UNIQUE REFERENCES bank_transactions(id),
    payment_id INTEGER UNIQUE REFERENCES payments(id),
    amount INTEGER NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS wallet_transactions_user_id_idx
    ON wallet_transactions(user_id);

  CREATE TABLE IF NOT EXISTS cash_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notification_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    push_enabled INTEGER NOT NULL DEFAULT 1,
    email_enabled INTEGER NOT NULL DEFAULT 1,
    push_subscription TEXT
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    endpoint TEXT NOT NULL UNIQUE,
    subscription TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS team_responsibilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'responsibility',
    status TEXT NOT NULL DEFAULT 'ok',
    owner TEXT,
    notes TEXT,
    quantity INTEGER,
    usable_quantity INTEGER,
    location TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS team_responsibility_owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    responsibility_id INTEGER NOT NULL REFERENCES team_responsibilities(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    UNIQUE(responsibility_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS team_inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    responsibility_id INTEGER NOT NULL REFERENCES team_responsibilities(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ok',
    quantity INTEGER,
    usable_quantity INTEGER,
    location TEXT,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER REFERENCES media_collections(id),
    category TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS opponents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
`);

const paymentColumns = sqlite.prepare("PRAGMA table_info(payments)").all() as Array<{ name: string }>;
if (!paymentColumns.some(column => column.name === "wallet_applied_amount")) {
  sqlite.exec("ALTER TABLE payments ADD COLUMN wallet_applied_amount INTEGER NOT NULL DEFAULT 0");
}

const walletTransactionColumns = sqlite.prepare("PRAGMA table_info(wallet_transactions)")
  .all() as Array<{ name: string }>;
if (!walletTransactionColumns.some(column => column.name === "payment_id")) {
  sqlite.exec("ALTER TABLE wallet_transactions ADD COLUMN payment_id INTEGER REFERENCES payments(id)");
}
sqlite.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_payment_id_idx
    ON wallet_transactions(payment_id);
`);

const responsibilityColumns = sqlite.prepare("PRAGMA table_info(team_responsibilities)")
  .all() as Array<{ name: string }>;
const responsibilityHadKind = responsibilityColumns.some(column => column.name === "kind");
if (!responsibilityHadKind) {
  sqlite.exec("ALTER TABLE team_responsibilities ADD COLUMN kind TEXT NOT NULL DEFAULT 'responsibility'");
}
if (!responsibilityColumns.some(column => column.name === "status")) {
  sqlite.exec("ALTER TABLE team_responsibilities ADD COLUMN status TEXT NOT NULL DEFAULT 'ok'");
}
if (!responsibilityColumns.some(column => column.name === "quantity")) {
  sqlite.exec("ALTER TABLE team_responsibilities ADD COLUMN quantity INTEGER");
}
if (!responsibilityColumns.some(column => column.name === "usable_quantity")) {
  sqlite.exec("ALTER TABLE team_responsibilities ADD COLUMN usable_quantity INTEGER");
}
if (!responsibilityColumns.some(column => column.name === "location")) {
  sqlite.exec("ALTER TABLE team_responsibilities ADD COLUMN location TEXT");
}
if (!responsibilityHadKind) {
  sqlite.exec(`
    UPDATE team_responsibilities
    SET kind = 'inventory'
    WHERE section = 'Výbava';

    UPDATE team_responsibilities
    SET quantity = 4, usable_quantity = 2, status = 'attention'
    WHERE section = 'Výbava' AND title = 'Balóny';

    UPDATE team_responsibilities
    SET status = 'attention'
    WHERE section = 'Výbava' AND title = 'Lekárnička';
  `);
}

const organizationSeedMarker = "team_responsibilities_seeded_v1";
const organizationSeeded = sqlite.prepare("SELECT value FROM app_settings WHERE key = ?")
  .get(organizationSeedMarker) as { value: string } | undefined;

if (!organizationSeeded) {
  const existingResponsibilities = sqlite.prepare("SELECT COUNT(*) AS count FROM team_responsibilities")
    .get() as { count: number };

  if (existingResponsibilities.count === 0) {
    const initialResponsibilities = [
      {
        section: "Administratíva",
        title: "Klubová administratíva",
        kind: "responsibility",
        status: "ok",
        owner: "Krši, Lukáš",
        notes: "• komunikácia s Poliakom\n• prihlášky a registrácie\n• prestupy",
        quantity: null,
        usableQuantity: null,
        location: null,
      },
      {
        section: "Finance",
        title: "Kontrola platieb",
        kind: "responsibility",
        status: "ok",
        owner: "Vedúci",
        notes: "• platby vykonáva vedúci\n• kontrola, kto zaplatil a kto nezaplatil\n• výber peňazí za tréning mimo tímu",
        quantity: null,
        usableQuantity: null,
        location: null,
      },
      {
        section: "Výbava",
        title: "Taška a náhradná výbava",
        kind: "inventory",
        status: "ok",
        owner: "Braňo",
        notes: "Obsah tašky:\n• 2 dresy\n• žlté rozlišky\n• pár červených a 1 zelená rozliška\n• coach tabuľa\n• pumpa\n• pokladnička (~200 Kč)\n• brankárske rukavice\n\nU Braňa:\n• staré dresy Mara a Varič\n• brankárske veci Horníka\n• ďalšie kusy oblečenia",
        quantity: 1,
        usableQuantity: 1,
        location: null,
      },
      {
        section: "Výbava",
        title: "Lekárnička",
        kind: "inventory",
        status: "attention",
        owner: "Braňo",
        notes: "• mraziace spreje\n• dezinfekcia a peroxid\n• obväzy\n• náplasti a ošetrenie odrenín\n• lepiaca páska\n• textilná páska — treba doplniť novú\n• rukavice",
        quantity: 1,
        usableQuantity: 1,
        location: null,
      },
      {
        section: "Výbava",
        title: "Balóny",
        kind: "inventory",
        status: "attention",
        owner: "Braňo",
        notes: "• približne 4 kusy\n• z toho 2 použiteľné\n• 1 balón od Slavoja",
        quantity: 4,
        usableQuantity: 2,
        location: null,
      },
      {
        section: "Zápasy",
        title: "Organizácia zápasov",
        kind: "responsibility",
        status: "ok",
        owner: null,
        notes: "• anketa účasti na zápas\n• zápis v IS FAČR",
        quantity: null,
        usableQuantity: null,
        location: null,
      },
      {
        section: "Zápasy",
        title: "Zapisovač gólov",
        kind: "responsibility",
        status: "ok",
        owner: "Braňo",
        notes: null,
        quantity: null,
        usableQuantity: null,
        location: null,
      },
      {
        section: "Zápasy",
        title: "Zapisovač asistencií",
        kind: "responsibility",
        status: "ok",
        owner: "Krši",
        notes: null,
        quantity: null,
        usableQuantity: null,
        location: null,
      },
    ];
    const insertResponsibility = sqlite.prepare(`
      INSERT INTO team_responsibilities
        (section, title, kind, status, owner, notes, quantity, usable_quantity, location, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    sqlite.transaction(() => {
      initialResponsibilities.forEach((item, index) => {
        insertResponsibility.run(
          item.section,
          item.title,
          item.kind,
          item.status,
          item.owner,
          item.notes,
          item.quantity,
          item.usableQuantity,
          item.location,
          index,
          now,
          now,
        );
      });
    })();
  }

  sqlite.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)")
    .run(organizationSeedMarker, "1");
}

const inventorySeedMarker = "team_inventory_items_seeded_v1";
const inventorySeeded = sqlite.prepare("SELECT value FROM app_settings WHERE key = ?")
  .get(inventorySeedMarker) as { value: string } | undefined;

if (!inventorySeeded) {
  const initialInventoryItems = [
    { parent: "Taška a náhradná výbava", name: "Náhradné dresy", status: "ok", quantity: 2, usableQuantity: 2, location: null, notes: null },
    { parent: "Taška a náhradná výbava", name: "Žlté rozlišky", status: "ok", quantity: null, usableQuantity: null, location: null, notes: null },
    { parent: "Taška a náhradná výbava", name: "Červené rozlišky", status: "ok", quantity: 2, usableQuantity: 2, location: null, notes: "Pár kusov" },
    { parent: "Taška a náhradná výbava", name: "Zelená rozliška", status: "ok", quantity: 1, usableQuantity: 1, location: null, notes: null },
    { parent: "Taška a náhradná výbava", name: "Coach tabuľa", status: "ok", quantity: 1, usableQuantity: 1, location: null, notes: null },
    { parent: "Taška a náhradná výbava", name: "Pumpa", status: "ok", quantity: 1, usableQuantity: 1, location: null, notes: null },
    { parent: "Taška a náhradná výbava", name: "Brankárske rukavice", status: "ok", quantity: 1, usableQuantity: 1, location: null, notes: null },
    { parent: "Taška a náhradná výbava", name: "Staré dresy Mara a Varič", status: "ok", quantity: 2, usableQuantity: 2, location: "u Braňa", notes: null },
    { parent: "Taška a náhradná výbava", name: "Brankárske veci Horníka", status: "ok", quantity: null, usableQuantity: null, location: "u Braňa", notes: null },
    { parent: "Taška a náhradná výbava", name: "Ďalšie kusy oblečenia", status: "ok", quantity: null, usableQuantity: null, location: "u Braňa", notes: null },
    { parent: "Lekárnička", name: "Mraziace spreje", status: "ok", quantity: null, usableQuantity: null, location: null, notes: null },
    { parent: "Lekárnička", name: "Dezinfekcia a peroxid", status: "ok", quantity: null, usableQuantity: null, location: null, notes: null },
    { parent: "Lekárnička", name: "Obväzy", status: "ok", quantity: null, usableQuantity: null, location: null, notes: null },
    { parent: "Lekárnička", name: "Náplasti na odreniny", status: "ok", quantity: null, usableQuantity: null, location: null, notes: null },
    { parent: "Lekárnička", name: "Lepiaca páska", status: "ok", quantity: null, usableQuantity: null, location: null, notes: null },
    { parent: "Lekárnička", name: "Textilná páska", status: "attention", quantity: null, usableQuantity: null, location: null, notes: "Treba doplniť novú" },
    { parent: "Lekárnička", name: "Rukavice", status: "ok", quantity: null, usableQuantity: null, location: null, notes: null },
    { parent: "Balóny", name: "Tímové balóny", status: "attention", quantity: 4, usableQuantity: 2, location: null, notes: null },
    { parent: "Balóny", name: "Balón od Slavoja", status: "ok", quantity: 1, usableQuantity: 1, location: null, notes: null },
  ];
  const findParent = sqlite.prepare("SELECT id FROM team_responsibilities WHERE title = ? AND kind = 'inventory'");
  const countParentItems = sqlite.prepare("SELECT COUNT(*) AS count FROM team_inventory_items WHERE responsibility_id = ?");
  const insertInventoryItem = sqlite.prepare(`
    INSERT INTO team_inventory_items
      (responsibility_id, name, status, quantity, usable_quantity, location, notes, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    const parentOffsets = new Map<number, number>();
    initialInventoryItems.forEach(item => {
      const parent = findParent.get(item.parent) as { id: number } | undefined;
      if (!parent) return;
      const existingCount = countParentItems.get(parent.id) as { count: number };
      if (existingCount.count > 0 && !parentOffsets.has(parent.id)) return;
      const sortOrder = parentOffsets.get(parent.id) ?? 0;
      insertInventoryItem.run(
        parent.id,
        item.name,
        item.status,
        item.quantity,
        item.usableQuantity,
        item.location,
        item.notes,
        sortOrder,
        now,
        now,
      );
      parentOffsets.set(parent.id, sortOrder + 1);
    });
  })();
  sqlite.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)")
    .run(inventorySeedMarker, "1");
}

const cashboxSeedMarker = "cashbox_initialized_v1";
const cashboxSeeded = sqlite.prepare("SELECT value FROM app_settings WHERE key = ?")
  .get(cashboxSeedMarker) as { value: string } | undefined;

if (!cashboxSeeded) {
  const cashTransactionCount = sqlite.prepare("SELECT COUNT(*) AS count FROM cash_transactions")
    .get() as { count: number };
  if (cashTransactionCount.count === 0) {
    sqlite.prepare(`
      INSERT INTO cash_transactions (type, amount, description, created_by, created_at)
      VALUES ('income', 200, 'Počiatočný stav pokladničky (odhad)', NULL, ?)
    `).run(new Date().toISOString());
  }

  sqlite.prepare(`
    DELETE FROM team_inventory_items
    WHERE name = 'Pokladnička'
      AND responsibility_id IN (
        SELECT id FROM team_responsibilities
        WHERE title = 'Taška a náhradná výbava'
      )
  `).run();
  sqlite.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)")
    .run(cashboxSeedMarker, "1");
}

// Payment IDs are stable numeric values and therefore make safe, unique
// variable symbols. Normalize older name-based symbols during startup too.
sqlite.exec(`
  UPDATE payments
  SET variable_symbol = CAST(id AS TEXT)
  WHERE variable_symbol IS NULL
     OR TRIM(variable_symbol) = ''
     OR variable_symbol GLOB '*[^0-9]*';
`);

export interface NewStoredMediaFile {
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: number;
  sortOrder?: number;
}

export type TacticWithFiles = MediaCollection & { files: MediaFile[] };
export type TeamResponsibilityWithOwners = TeamResponsibility & {
  owners: Array<Pick<User, "id" | "name">>;
  inventoryItems: TeamInventoryItem[];
};

export interface PlayerStatisticSummary {
  userId: number;
  name: string;
  goals: number;
  assists: number;
  updatedAt: string | null;
}

export interface MatchPlayerContributionInput {
  userId: number;
  goals: number;
  assists: number;
}

export type MatchResultWithPlayers = MatchResult & {
  players: Array<MatchPlayerStatistic & { user: Pick<User, "id" | "name"> }>;
};

export interface IStorage {
  // Users
  getUser(id: number): User | undefined;
  getUserByEmail(email: string): User | undefined;
  getAllUsers(): User[];
  createUser(user: InsertUser): User;
  updateUserRole(id: number, role: string): User | undefined;
  updateUserActiveStatus(id: number, isActive: boolean): User | undefined;
  updateUserTheme(id: number, theme: "light" | "dark"): User | undefined;
  updateUserProfile(id: number, firstName: string, lastName: string, nickname: string): User | undefined;
  updateUserPassword(id: number, password: string): User | undefined;
  markUserEmailVerified(id: number): User | undefined;

  // Player statistics
  getPlayerStatistics(): PlayerStatisticSummary[];
  adjustPlayerStatistics(userId: number, goalsDelta: number, assistsDelta: number): PlayerStatisticSummary | undefined;

  // Email verification
  createEmailVerificationToken(userId: number, tokenHash: string, expiresAt: string): EmailVerificationToken;
  getEmailVerificationToken(tokenHash: string): EmailVerificationToken | undefined;
  deleteEmailVerificationTokens(userId: number): void;

  // Password reset
  createPasswordResetToken(userId: number, tokenHash: string, expiresAt: string): PasswordResetToken;
  getPasswordResetToken(tokenHash: string): PasswordResetToken | undefined;
  deletePasswordResetTokens(userId: number): void;

  // Events
  getEvent(id: number): Event | undefined;
  getEventsByExternalId(externalId: string): Event[];
  getAllEvents(): Event[];
  getUpcomingEvents(limit?: number): Event[];
  createEvent(event: InsertEvent): Event;
  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined;
  deleteEvent(id: number): void;

  // Match results
  getMatchResult(eventId: number): MatchResultWithPlayers | undefined;
  upsertMatchResult(
    eventId: number,
    teamScore: number,
    opponentScore: number,
    notes: string | null,
    updatedBy: number,
    players: MatchPlayerContributionInput[],
  ): MatchResultWithPlayers;
  deleteMatchResult(eventId: number): boolean;

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
  createPayments(paymentList: InsertPayment[]): Payment[];
  updatePaymentStatus(id: number, status: string): Payment | undefined;
  deletePayment(id: number): void;
  getPendingPaymentsByVariableSymbol(vs: string): Payment[];

  // Bank Transactions
  getAllBankTransactions(limit?: number): BankTransaction[];
  getUnmatchedBankTransactions(): BankTransaction[];
  createBankTransaction(tx: Omit<BankTransaction, 'id'>): BankTransaction | undefined;
  updateBankTransactionMatch(id: number, paymentId: number | null): void;

  // User wallets
  getWalletBalance(userId: number): number;
  getWalletBalances(): Map<number, number>;
  getWalletTransactionsByUser(userId: number): WalletTransaction[];
  createWalletTransaction(transaction: InsertWalletTransaction): WalletTransaction | undefined;

  // Cashbox
  getAllCashTransactions(): CashTransaction[];
  getCashBalance(): number;
  createCashTransaction(tx: InsertCashTransaction): CashTransaction;
  deleteCashTransaction(id: number): boolean;

  // Notification Settings
  getNotificationSettings(userId: number): NotificationSettings | undefined;
  upsertNotificationSettings(settings: Partial<InsertNotificationSettings> & { userId: number }): void;
  getPushSubscriptionsByUser(userId: number): PushSubscriptionRecord[];
  upsertPushSubscription(userId: number, endpoint: string, subscription: string): PushSubscriptionRecord;
  deletePushSubscription(userId: number, endpoint: string): void;
  deletePushSubscriptionByEndpoint(endpoint: string): void;

  // Team organization
  getTeamResponsibilities(): TeamResponsibilityWithOwners[];
  getTeamResponsibility(id: number): TeamResponsibilityWithOwners | undefined;
  createTeamResponsibility(responsibility: InsertTeamResponsibility, ownerIds: number[]): TeamResponsibilityWithOwners;
  updateTeamResponsibility(id: number, responsibility: InsertTeamResponsibility, ownerIds: number[]): TeamResponsibilityWithOwners | undefined;
  deleteTeamResponsibility(id: number): boolean;
  reorderTeamResponsibilities(ids: number[]): void;
  getTeamInventoryItem(responsibilityId: number, itemId: number): TeamInventoryItem | undefined;
  createTeamInventoryItem(item: InsertTeamInventoryItem): TeamInventoryItem;
  updateTeamInventoryItem(responsibilityId: number, itemId: number, item: Omit<InsertTeamInventoryItem, "responsibilityId">): TeamInventoryItem | undefined;
  deleteTeamInventoryItem(responsibilityId: number, itemId: number): boolean;
  reorderTeamInventoryItems(responsibilityId: number, ids: number[]): void;

  // App Settings
  getAppSetting(key: string): string | undefined;
  setAppSetting(key: string, value: string): void;

  // Team media
  getMediaFile(id: number): MediaFile | undefined;
  getPhotos(): MediaFile[];
  createPhotos(files: NewStoredMediaFile[]): MediaFile[];
  deleteMediaFile(id: number): void;
  getTacticCollections(): TacticWithFiles[];
  getTacticCollection(id: number): TacticWithFiles | undefined;
  createTacticCollection(
    title: string,
    description: string | null,
    createdBy: number,
    files: NewStoredMediaFile[],
  ): TacticWithFiles;
  updateTacticCollection(
    id: number,
    title: string,
    description: string | null,
    fileOrder: number[],
    newFiles: NewStoredMediaFile[],
  ): TacticWithFiles | undefined;
  deleteTacticFile(collectionId: number, fileId: number): MediaFile | undefined;
  deleteTacticCollection(id: number): void;
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

function applyPlayerStatisticDelta(
  tx: any,
  userId: number,
  goalsDelta: number,
  assistsDelta: number,
  updatedAt: string,
) {
  if (goalsDelta === 0 && assistsDelta === 0) return;
  const existing = tx.select().from(playerStatistics).where(eq(playerStatistics.userId, userId)).get() as PlayerStatistic | undefined;
  const goals = (existing?.goals ?? 0) + goalsDelta;
  const assists = (existing?.assists ?? 0) + assistsDelta;
  if (goals < 0 || assists < 0) {
    throw new Error("Celková štatistika hráča nemôže byť nižšia ako príspevky zo zápasov");
  }
  if (goals > 10_000 || assists > 10_000) {
    throw new Error("Štatistika hráča je príliš vysoká");
  }
  if (existing) {
    tx.update(playerStatistics)
      .set({ goals, assists, updatedAt })
      .where(eq(playerStatistics.id, existing.id))
      .run();
  } else {
    tx.insert(playerStatistics).values({ userId, goals, assists, updatedAt }).run();
  }
}

function deleteMatchResultInTransaction(tx: any, eventId: number): boolean {
  const result = tx.select().from(matchResults).where(eq(matchResults.eventId, eventId)).get() as MatchResult | undefined;
  if (!result) return false;
  const contributions = tx.select().from(matchPlayerStatistics)
    .where(eq(matchPlayerStatistics.eventId, eventId))
    .all() as MatchPlayerStatistic[];
  const updatedAt = new Date().toISOString();
  contributions.forEach(contribution => {
    applyPlayerStatisticDelta(tx, contribution.userId, -contribution.goals, -contribution.assists, updatedAt);
  });
  tx.delete(matchPlayerStatistics).where(eq(matchPlayerStatistics.eventId, eventId)).run();
  tx.delete(matchResults).where(eq(matchResults.eventId, eventId)).run();
  return true;
}

function createPaymentWithWalletInTransaction(tx: any, payment: InsertPayment): Payment {
  if (!Number.isInteger(payment.amount) || payment.amount <= 0) {
    throw new Error("Suma musí byť kladné celé číslo");
  }

  const walletBalance = (tx.select().from(walletTransactions)
    .where(eq(walletTransactions.userId, payment.userId))
    .all() as WalletTransaction[])
    .reduce((balance, transaction) => balance + transaction.amount, 0);
  const walletAppliedAmount = Math.min(Math.max(walletBalance, 0), payment.amount);
  const status = walletAppliedAmount === payment.amount ? "paid" : "pending";

  const created = tx.insert(payments)
    .values({
      ...payment,
      variableSymbol: null,
      walletAppliedAmount,
      status,
    })
    .returning()
    .get() as Payment;

  if (walletAppliedAmount > 0) {
    tx.insert(walletTransactions).values({
      userId: payment.userId,
      bankTransactionId: null,
      paymentId: created.id,
      amount: -walletAppliedAmount,
      description: `Platba #${created.id}: ${payment.description}`,
    }).run();
  }

  return tx.update(payments)
    .set({ variableSymbol: String(created.id) })
    .where(eq(payments.id, created.id))
    .returning()
    .get() as Payment;
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

  // ============ PASSWORD RESET ============
  createPasswordResetToken(userId: number, tokenHash: string, expiresAt: string): PasswordResetToken {
    this.deletePasswordResetTokens(userId);
    return db.insert(passwordResetTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning()
      .get();
  }

  getPasswordResetToken(tokenHash: string): PasswordResetToken | undefined {
    return db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .get();
  }

  deletePasswordResetTokens(userId: number): void {
    db.delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .run();
  }

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
        const user = this.getUser(contribution.userId);
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
      players
        .filter(player => player.goals > 0 || player.assists > 0)
        .forEach(player => {
          tx.insert(matchPlayerStatistics).values({
            eventId,
            userId: player.userId,
            goals: player.goals,
            assists: player.assists,
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
    return db.transaction(tx => createPaymentWithWalletInTransaction(tx, payment));
  }

  createPayments(paymentList: InsertPayment[]): Payment[] {
    if (paymentList.length === 0) return [];
    return db.transaction(tx => paymentList.map(payment =>
      createPaymentWithWalletInTransaction(tx, payment),
    ));
  }

  updatePaymentStatus(id: number, status: string): Payment | undefined {
    return db.update(payments)
      .set({ status })
      .where(eq(payments.id, id))
      .returning()
      .get();
  }

  deletePayment(id: number): void {
    db.transaction(tx => {
      tx.update(bankTransactions)
        .set({ matchedPaymentId: null })
        .where(eq(bankTransactions.matchedPaymentId, id))
        .run();
      tx.delete(walletTransactions)
        .where(eq(walletTransactions.paymentId, id))
        .run();
      tx.delete(payments).where(eq(payments.id, id)).run();
    });
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

  // ============ USER WALLETS ============
  getWalletBalance(userId: number): number {
    return db.select().from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .all()
      .reduce((balance, transaction) => balance + transaction.amount, 0);
  }

  getWalletBalances(): Map<number, number> {
    return db.select().from(walletTransactions).all().reduce((balances, transaction) => {
      balances.set(transaction.userId, (balances.get(transaction.userId) ?? 0) + transaction.amount);
      return balances;
    }, new Map<number, number>());
  }

  getWalletTransactionsByUser(userId: number): WalletTransaction[] {
    return db.select().from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt), desc(walletTransactions.id))
      .all();
  }

  createWalletTransaction(transaction: InsertWalletTransaction): WalletTransaction | undefined {
    if (transaction.bankTransactionId) {
      const existing = db.select().from(walletTransactions)
        .where(eq(walletTransactions.bankTransactionId, transaction.bankTransactionId))
        .get();
      if (existing) return undefined;
    }
    if (transaction.paymentId) {
      const existing = db.select().from(walletTransactions)
        .where(eq(walletTransactions.paymentId, transaction.paymentId))
        .get();
      if (existing) return undefined;
    }

    return db.insert(walletTransactions).values(transaction).returning().get();
  }

  // ============ CASHBOX ============
  getAllCashTransactions(): CashTransaction[] {
    return db.select().from(cashTransactions)
      .orderBy(desc(cashTransactions.createdAt), desc(cashTransactions.id))
      .all();
  }

  getCashBalance(): number {
    return this.getAllCashTransactions().reduce(
      (balance, transaction) => balance + (transaction.type === "income" ? transaction.amount : -transaction.amount),
      0,
    );
  }

  createCashTransaction(tx: InsertCashTransaction): CashTransaction {
    return db.insert(cashTransactions).values(tx).returning().get();
  }

  deleteCashTransaction(id: number): boolean {
    return db.delete(cashTransactions).where(eq(cashTransactions.id, id)).run().changes > 0;
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

  getPushSubscriptionsByUser(userId: number): PushSubscriptionRecord[] {
    return db.select().from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .all();
  }

  upsertPushSubscription(userId: number, endpoint: string, subscription: string): PushSubscriptionRecord {
    const existing = db.select().from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .get();
    const updatedAt = new Date().toISOString();

    if (existing) {
      return db.update(pushSubscriptions)
        .set({ userId, subscription, updatedAt })
        .where(eq(pushSubscriptions.id, existing.id))
        .returning()
        .get();
    }

    return db.insert(pushSubscriptions)
      .values({ userId, endpoint, subscription, updatedAt })
      .returning()
      .get();
  }

  deletePushSubscription(userId: number, endpoint: string): void {
    db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
      .run();
  }

  deletePushSubscriptionByEndpoint(endpoint: string): void {
    db.delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .run();
  }

  // ============ TEAM ORGANIZATION ============
  getTeamResponsibilities(): TeamResponsibilityWithOwners[] {
    return db.select().from(teamResponsibilities)
      .orderBy(asc(teamResponsibilities.sortOrder), asc(teamResponsibilities.id))
      .all()
      .map(responsibility => this.attachTeamResponsibilityOwners(responsibility));
  }

  getTeamResponsibility(id: number): TeamResponsibilityWithOwners | undefined {
    const responsibility = db.select().from(teamResponsibilities)
      .where(eq(teamResponsibilities.id, id))
      .get();
    return responsibility ? this.attachTeamResponsibilityOwners(responsibility) : undefined;
  }

  private attachTeamResponsibilityOwners(responsibility: TeamResponsibility): TeamResponsibilityWithOwners {
    const owners = db.select().from(teamResponsibilityOwners)
      .where(eq(teamResponsibilityOwners.responsibilityId, responsibility.id))
      .all()
      .map(assignment => db.select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, assignment.userId))
      .get())
      .filter((owner): owner is Pick<User, "id" | "name"> => Boolean(owner));
    const inventoryItems = db.select().from(teamInventoryItems)
      .where(eq(teamInventoryItems.responsibilityId, responsibility.id))
      .orderBy(asc(teamInventoryItems.sortOrder), asc(teamInventoryItems.id))
      .all();
    return { ...responsibility, owners, inventoryItems };
  }

  createTeamResponsibility(responsibility: InsertTeamResponsibility, ownerIds: number[]): TeamResponsibilityWithOwners {
    const nextOrder = sqlite.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM team_responsibilities")
      .get() as { value: number };
    const created = db.transaction(tx => {
      const item = tx.insert(teamResponsibilities)
        .values({ ...responsibility, sortOrder: responsibility.sortOrder ?? nextOrder.value })
        .returning()
        .get();
      if (ownerIds.length > 0) {
        tx.insert(teamResponsibilityOwners)
          .values(ownerIds.map(userId => ({ responsibilityId: item.id, userId })))
          .run();
      }
      return item;
    });
    return this.attachTeamResponsibilityOwners(created);
  }

  updateTeamResponsibility(id: number, responsibility: InsertTeamResponsibility, ownerIds: number[]): TeamResponsibilityWithOwners | undefined {
    if (!this.getTeamResponsibility(id)) return undefined;
    db.transaction(tx => {
      tx.update(teamResponsibilities)
        .set({ ...responsibility, updatedAt: new Date().toISOString() })
        .where(eq(teamResponsibilities.id, id))
        .run();
      tx.delete(teamResponsibilityOwners)
        .where(eq(teamResponsibilityOwners.responsibilityId, id))
        .run();
      if (ownerIds.length > 0) {
        tx.insert(teamResponsibilityOwners)
          .values(ownerIds.map(userId => ({ responsibilityId: id, userId })))
          .run();
      }
    });
    return this.getTeamResponsibility(id);
  }

  deleteTeamResponsibility(id: number): boolean {
    return db.transaction(tx => {
      tx.delete(teamInventoryItems)
        .where(eq(teamInventoryItems.responsibilityId, id))
        .run();
      tx.delete(teamResponsibilityOwners)
        .where(eq(teamResponsibilityOwners.responsibilityId, id))
        .run();
      return tx.delete(teamResponsibilities).where(eq(teamResponsibilities.id, id)).run().changes > 0;
    });
  }

  reorderTeamResponsibilities(ids: number[]): void {
    const existingIds = db.select({ id: teamResponsibilities.id }).from(teamResponsibilities).all().map(item => item.id);
    const sortedExisting = [...existingIds].sort((first, second) => first - second);
    const sortedRequested = Array.from(new Set(ids)).sort((first, second) => first - second);
    if (sortedExisting.length !== sortedRequested.length || sortedExisting.some((id, index) => id !== sortedRequested[index])) {
      throw new Error("Neplatné poradie položiek");
    }
    db.transaction(tx => {
      ids.forEach((id, index) => {
        tx.update(teamResponsibilities)
          .set({ sortOrder: index, updatedAt: new Date().toISOString() })
          .where(eq(teamResponsibilities.id, id))
          .run();
      });
    });
  }

  getTeamInventoryItem(responsibilityId: number, itemId: number): TeamInventoryItem | undefined {
    return db.select().from(teamInventoryItems)
      .where(and(eq(teamInventoryItems.id, itemId), eq(teamInventoryItems.responsibilityId, responsibilityId)))
      .get();
  }

  createTeamInventoryItem(item: InsertTeamInventoryItem): TeamInventoryItem {
    const nextOrder = sqlite.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM team_inventory_items WHERE responsibility_id = ?")
      .get(item.responsibilityId) as { value: number };
    return db.insert(teamInventoryItems)
      .values({ ...item, sortOrder: item.sortOrder ?? nextOrder.value })
      .returning()
      .get();
  }

  updateTeamInventoryItem(
    responsibilityId: number,
    itemId: number,
    item: Omit<InsertTeamInventoryItem, "responsibilityId">,
  ): TeamInventoryItem | undefined {
    return db.update(teamInventoryItems)
      .set({ ...item, updatedAt: new Date().toISOString() })
      .where(and(eq(teamInventoryItems.id, itemId), eq(teamInventoryItems.responsibilityId, responsibilityId)))
      .returning()
      .get();
  }

  deleteTeamInventoryItem(responsibilityId: number, itemId: number): boolean {
    return db.delete(teamInventoryItems)
      .where(and(eq(teamInventoryItems.id, itemId), eq(teamInventoryItems.responsibilityId, responsibilityId)))
      .run().changes > 0;
  }

  reorderTeamInventoryItems(responsibilityId: number, ids: number[]): void {
    const existingIds = db.select({ id: teamInventoryItems.id })
      .from(teamInventoryItems)
      .where(eq(teamInventoryItems.responsibilityId, responsibilityId))
      .all()
      .map(item => item.id);
    const sortedExisting = [...existingIds].sort((first, second) => first - second);
    const sortedRequested = Array.from(new Set(ids)).sort((first, second) => first - second);
    if (sortedExisting.length !== sortedRequested.length || sortedExisting.some((id, index) => id !== sortedRequested[index])) {
      throw new Error("Neplatné poradie inventára");
    }
    db.transaction(tx => {
      ids.forEach((id, index) => {
        tx.update(teamInventoryItems)
          .set({ sortOrder: index, updatedAt: new Date().toISOString() })
          .where(and(eq(teamInventoryItems.id, id), eq(teamInventoryItems.responsibilityId, responsibilityId)))
          .run();
      });
    });
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

  // ============ TEAM MEDIA ============
  getMediaFile(id: number): MediaFile | undefined {
    return db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).get();
  }

  getPhotos(): MediaFile[] {
    return db.select().from(mediaFiles)
      .where(eq(mediaFiles.category, "photo"))
      .orderBy(desc(mediaFiles.createdAt))
      .all();
  }

  createPhotos(files: NewStoredMediaFile[]): MediaFile[] {
    if (files.length === 0) return [];
    return db.insert(mediaFiles).values(files.map((file, index) => ({
      ...file,
      collectionId: null,
      category: "photo",
      sortOrder: file.sortOrder ?? index,
    }))).returning().all();
  }

  deleteMediaFile(id: number): void {
    db.delete(mediaFiles).where(eq(mediaFiles.id, id)).run();
  }

  getTacticCollections(): TacticWithFiles[] {
    return db.select().from(mediaCollections)
      .where(eq(mediaCollections.kind, "tactic"))
      .orderBy(desc(mediaCollections.createdAt))
      .all()
      .map(collection => ({
        ...collection,
        files: db.select().from(mediaFiles)
          .where(eq(mediaFiles.collectionId, collection.id))
          .orderBy(asc(mediaFiles.sortOrder))
          .all(),
      }));
  }

  getTacticCollection(id: number): TacticWithFiles | undefined {
    const collection = db.select().from(mediaCollections)
      .where(and(eq(mediaCollections.id, id), eq(mediaCollections.kind, "tactic")))
      .get();
    if (!collection) return undefined;

    return {
      ...collection,
      files: db.select().from(mediaFiles)
        .where(eq(mediaFiles.collectionId, collection.id))
        .orderBy(asc(mediaFiles.sortOrder))
        .all(),
    };
  }

  createTacticCollection(
    title: string,
    description: string | null,
    createdBy: number,
    files: NewStoredMediaFile[],
  ): TacticWithFiles {
    return db.transaction(tx => {
      const collection = tx.insert(mediaCollections).values({
        kind: "tactic",
        title,
        description,
        createdBy,
      }).returning().get();

      const createdFiles = tx.insert(mediaFiles).values(files.map((file, index) => ({
        ...file,
        collectionId: collection.id,
        category: "tactic",
        sortOrder: file.sortOrder ?? index,
      }))).returning().all();

      return { ...collection, files: createdFiles };
    });
  }

  updateTacticCollection(
    id: number,
    title: string,
    description: string | null,
    fileOrder: number[],
    newFiles: NewStoredMediaFile[],
  ): TacticWithFiles | undefined {
    const existing = this.getTacticCollection(id);
    if (!existing) return undefined;

    const existingIds = existing.files.map(file => file.id).sort((a, b) => a - b);
    const orderedIds = [...fileOrder].sort((a, b) => a - b);
    if (existingIds.length !== orderedIds.length || existingIds.some((fileId, index) => fileId !== orderedIds[index])) {
      throw new Error("Neplatné poradie súborov");
    }

    db.transaction(tx => {
      tx.update(mediaCollections)
        .set({ title, description })
        .where(eq(mediaCollections.id, id))
        .run();

      fileOrder.forEach((fileId, index) => {
        tx.update(mediaFiles)
          .set({ sortOrder: index })
          .where(and(eq(mediaFiles.id, fileId), eq(mediaFiles.collectionId, id)))
          .run();
      });

      if (newFiles.length > 0) {
        tx.insert(mediaFiles).values(newFiles.map((file, index) => ({
          ...file,
          collectionId: id,
          category: "tactic",
          sortOrder: fileOrder.length + index,
        }))).run();
      }
    });

    return this.getTacticCollection(id);
  }

  deleteTacticFile(collectionId: number, fileId: number): MediaFile | undefined {
    const tactic = this.getTacticCollection(collectionId);
    const file = tactic?.files.find(candidate => candidate.id === fileId);
    if (!tactic || !file) return undefined;

    db.transaction(tx => {
      tx.delete(mediaFiles)
        .where(and(eq(mediaFiles.id, fileId), eq(mediaFiles.collectionId, collectionId)))
        .run();

      tactic.files
        .filter(candidate => candidate.id !== fileId)
        .forEach((candidate, index) => {
          tx.update(mediaFiles)
            .set({ sortOrder: index })
            .where(eq(mediaFiles.id, candidate.id))
            .run();
        });
    });

    return file;
  }

  deleteTacticCollection(id: number): void {
    db.transaction(tx => {
      tx.delete(mediaFiles).where(eq(mediaFiles.collectionId, id)).run();
      tx.delete(mediaCollections).where(eq(mediaCollections.id, id)).run();
    });
  }
}

export const storage = new DatabaseStorage();
