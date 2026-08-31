import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import type * as z from "zod/mini";

// ============ USERS ============
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  nickname: text("nickname"),
  phone: text("phone"),
  role: text("role").notNull().default("player"), // admin | manager | player
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isPlayerActive: integer("is_player_active", { mode: "boolean" }).notNull().default(true),
  theme: text("theme").notNull().default("light"), // light | dark
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  passwordVersion: integer("password_version").notNull().default(0),
  termsVersion: integer("terms_version").notNull().default(0),
  termsAcceptedAt: text("terms_accepted_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  name: true,
  firstName: true,
  lastName: true,
  nickname: true,
  phone: true,
  role: true,
  termsVersion: true,
  termsAcceptedAt: true,
});

export const loginUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
export type User = typeof users.$inferSelect;

// ============ PLAYER STATISTICS ============
export const playerStatistics = sqliteTable("player_statistics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().unique().references(() => users.id),
  goals: integer("goals").notNull().default(0),
  assists: integer("assists").notNull().default(0),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type PlayerStatistic = typeof playerStatistics.$inferSelect;

// ============ EMAIL VERIFICATION TOKENS ============
export const emailVerificationTokens = sqliteTable("email_verification_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;

// ============ PASSWORD RESET TOKENS ============
export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// ============ EVENTS ============
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // match | training | teambuilding
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  opponent: text("opponent"), // for matches (display name)
  opponentId: integer("opponent_id").references(() => opponents.id), // link to opponents table
  homeAway: text("home_away"), // home | away (for matches)
  externalId: text("external_id"),
  source: text("source").notNull().default("local"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertEventSchema = createInsertSchema(events).pick({
  type: true,
  title: true,
  description: true,
  location: true,
  startTime: true,
  endTime: true,
  opponent: true,
  opponentId: true,
  homeAway: true,
  externalId: true,
  source: true,
  createdBy: true,
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// ============ MATCH RESULTS ============
export const matchResults = sqliteTable("match_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull().unique().references(() => events.id),
  teamScore: integer("team_score").notNull(),
  opponentScore: integer("opponent_score").notNull(),
  notes: text("notes"),
  updatedBy: integer("updated_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const matchPlayerStatistics = sqliteTable("match_player_statistics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull().references(() => events.id),
  userId: integer("user_id").notNull().references(() => users.id),
  goals: integer("goals").notNull().default(0),
  assists: integer("assists").notNull().default(0),
  played: integer("played", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type MatchResult = typeof matchResults.$inferSelect;
export type MatchPlayerStatistic = typeof matchPlayerStatistics.$inferSelect;

// ============ EVENT RESPONSES (Attendance) ============
export const eventResponses = sqliteTable("event_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull().references(() => events.id),
  userId: integer("user_id").notNull().references(() => users.id),
  status: text("status").notNull(), // going | not_going | maybe
  note: text("note"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertEventResponseSchema = createInsertSchema(eventResponses).pick({
  eventId: true,
  userId: true,
  status: true,
  note: true,
});

export type InsertEventResponse = z.infer<typeof insertEventResponseSchema>;
export type EventResponse = typeof eventResponses.$inferSelect;

// ============ POLLS ============
export const polls = sqliteTable("polls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  closesAt: text("closes_at"),
  isAnonymous: integer("is_anonymous", { mode: "boolean" }).notNull().default(false),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const opponents = sqliteTable("opponents", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description"),
});

export const insertPollSchema = createInsertSchema(polls).pick({
  title: true,
  description: true,
  closesAt: true,
  isAnonymous: true,
  createdBy: true,
});

export const insertOpponentSchema =  createInsertSchema(opponents).pick({
  name: true,
  description: true,
});
export type InsertOpponent = z.infer<typeof insertOpponentSchema>;

export const updateOpponentSchema = insertOpponentSchema.partial();

export type UpdateOpponent = z.infer<typeof updateOpponentSchema>;

export type InsertPoll = z.infer<typeof insertPollSchema>;
export type Poll = typeof polls.$inferSelect;
export type Opponent = typeof opponents.$inferSelect;

// ============ POLL OPTIONS ============
export const pollOptions = sqliteTable("poll_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pollId: integer("poll_id").notNull().references(() => polls.id),
  label: text("label").notNull(),
});

export const insertPollOptionSchema = createInsertSchema(pollOptions).pick({
  pollId: true,
  label: true,
});

export type InsertPollOption = z.infer<typeof insertPollOptionSchema>;
export type PollOption = typeof pollOptions.$inferSelect;

// ============ POLL VOTES ============
export const pollVotes = sqliteTable("poll_votes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pollId: integer("poll_id").notNull().references(() => polls.id),
  optionId: integer("option_id").notNull().references(() => pollOptions.id),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertPollVoteSchema = createInsertSchema(pollVotes).pick({
  pollId: true,
  optionId: true,
  userId: true,
});

export type InsertPollVote = z.infer<typeof insertPollVoteSchema>;
export type PollVote = typeof pollVotes.$inferSelect;

// ============ PAYMENTS (Expected dues) ============
export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(), // in CZK (integer to avoid float issues)
  fullPrice: integer("full_price").notNull().default(0), // total amount before splitting across selected members
  identity: text("identity"),
  walletAppliedAmount: integer("wallet_applied_amount").notNull().default(0),
  dueDate: text("due_date").notNull(),
  variableSymbol: text("variable_symbol"),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"), // pending | paid | overdue
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertPaymentSchema = createInsertSchema(payments).pick({
  userId: true,
  amount: true,
  fullPrice: true,
  identity: true,
  dueDate: true,
  variableSymbol: true,
  description: true,
  status: true,
});

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// ============ BANK TRANSACTIONS (Synced from FIO API) ============
export const bankTransactions = sqliteTable("bank_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: text("transaction_id").notNull().unique(), // FIO IDpohyb
  amount: integer("amount").notNull(), // haléře for CZK; rejected non-CZK rows keep their exact source amount in raw_data
  currency: text("currency").notNull().default("CZK"),
  date: text("date").notNull(),
  payerName: text("payer_name"),
  payerAccount: text("payer_account"),
  payerBankCode: text("payer_bank_code"),
  payerIban: text("payer_iban"),
  variableSymbol: text("variable_symbol"),
  constantSymbol: text("constant_symbol"),
  memo: text("memo"),
  syncError: text("sync_error"),
  rawData: text("raw_data"),
  matchedPaymentId: integer("matched_payment_id").references(() => payments.id),
  reconciledUserId: integer("reconciled_user_id").references(() => users.id),
  reconciledBy: integer("reconciled_by").references(() => users.id),
  reconciledAt: text("reconciled_at"),
  syncedAt: text("synced_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type BankTransaction = typeof bankTransactions.$inferSelect;

// ============ USER WALLETS (Ledger entries) ============
export const walletTransactions = sqliteTable("wallet_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  bankTransactionId: integer("bank_transaction_id").unique().references(() => bankTransactions.id),
  paymentId: integer("payment_id").unique().references(() => payments.id),
  amount: integer("amount").notNull(), // in CZK; balance is the sum of all entries
  description: text("description").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertWalletTransactionSchema = createInsertSchema(walletTransactions).pick({
  userId: true,
  bankTransactionId: true,
  paymentId: true,
  amount: true,
  description: true,
  createdBy: true,
});

export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type WalletTransaction = typeof walletTransactions.$inferSelect;

// ============ CASHBOX ============
export const cashTransactions = sqliteTable("cash_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // income | expense
  amount: integer("amount").notNull(), // in CZK
  description: text("description").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertCashTransactionSchema = createInsertSchema(cashTransactions).pick({
  type: true,
  amount: true,
  description: true,
  createdBy: true,
});

export type InsertCashTransaction = z.infer<typeof insertCashTransactionSchema>;
export type CashTransaction = typeof cashTransactions.$inferSelect;

// ============ NOTIFICATION SETTINGS ============
export const notificationSettings = sqliteTable("notification_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  pushEnabled: integer("push_enabled", { mode: "boolean" }).notNull().default(true),
  emailEnabled: integer("email_enabled", { mode: "boolean" }).notNull().default(true),
  pushSubscription: text("push_subscription"), // JSON string of web-push subscription
});

export const insertNotificationSettingsSchema = createInsertSchema(notificationSettings).pick({
  userId: true,
  pushEnabled: true,
  emailEnabled: true,
  pushSubscription: true,
});

export type InsertNotificationSettings = z.infer<typeof insertNotificationSettingsSchema>;
export type NotificationSettings = typeof notificationSettings.$inferSelect;

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  subscription: text("subscription").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;

// ============ TEAM ORGANIZATION ============
export const teamResponsibilities = sqliteTable("team_responsibilities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  section: text("section").notNull(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("responsibility"), // responsibility | inventory
  status: text("status").notNull().default("ok"), // ok | attention | done
  owner: text("owner"),
  notes: text("notes"),
  quantity: integer("quantity"),
  usableQuantity: integer("usable_quantity"),
  location: text("location"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertTeamResponsibilitySchema = createInsertSchema(teamResponsibilities).pick({
  section: true,
  title: true,
  kind: true,
  status: true,
  owner: true,
  notes: true,
  quantity: true,
  usableQuantity: true,
  location: true,
  sortOrder: true,
});

export type InsertTeamResponsibility = z.infer<typeof insertTeamResponsibilitySchema>;
export type TeamResponsibility = typeof teamResponsibilities.$inferSelect;

export const teamResponsibilityOwners = sqliteTable("team_responsibility_owners", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responsibilityId: integer("responsibility_id").notNull().references(() => teamResponsibilities.id),
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type TeamResponsibilityOwner = typeof teamResponsibilityOwners.$inferSelect;

export const teamInventoryItems = sqliteTable("team_inventory_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responsibilityId: integer("responsibility_id").notNull().references(() => teamResponsibilities.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("ok"), // ok | attention | done
  quantity: integer("quantity"),
  usableQuantity: integer("usable_quantity"),
  location: text("location"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertTeamInventoryItemSchema = createInsertSchema(teamInventoryItems).pick({
  responsibilityId: true,
  name: true,
  status: true,
  quantity: true,
  usableQuantity: true,
  location: true,
  notes: true,
  sortOrder: true,
});

export type InsertTeamInventoryItem = z.infer<typeof insertTeamInventoryItemSchema>;
export type TeamInventoryItem = typeof teamInventoryItems.$inferSelect;

// ============ APP SETTINGS (key-value store) ============
export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;

// ============ TEAM MEDIA ============
export const mediaCollections = sqliteTable("media_collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(), // tactic
  title: text("title").notNull(),
  description: text("description"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const mediaFiles = sqliteTable("media_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collectionId: integer("collection_id").references(() => mediaCollections.id),
  category: text("category").notNull(), // photo | tactic
  storedName: text("stored_name").notNull().unique(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedBy: integer("uploaded_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type MediaCollection = typeof mediaCollections.$inferSelect;
export type MediaFile = typeof mediaFiles.$inferSelect;
