import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import type * as z from "zod/mini";

// ============ USERS ============
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default("player"), // admin | player
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  theme: text("theme").notNull().default("light"), // light | dark
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  name: true,
  phone: true,
  role: true,
});

export const loginUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
export type User = typeof users.$inferSelect;

// ============ EMAIL VERIFICATION TOKENS ============
export const emailVerificationTokens = sqliteTable("email_verification_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;

// ============ EVENTS ============
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // match | training | teambuilding
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  opponent: text("opponent"), // for matches
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
  homeAway: true,
  externalId: true,
  source: true,
  createdBy: true,
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

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
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertPollSchema = createInsertSchema(polls).pick({
  title: true,
  description: true,
  closesAt: true,
  createdBy: true,
});

export type InsertPoll = z.infer<typeof insertPollSchema>;
export type Poll = typeof polls.$inferSelect;

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
  dueDate: text("due_date").notNull(),
  variableSymbol: text("variable_symbol"),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"), // pending | paid | overdue
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertPaymentSchema = createInsertSchema(payments).pick({
  userId: true,
  amount: true,
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
  amount: integer("amount").notNull(), // in CZK
  date: text("date").notNull(),
  payerName: text("payer_name"),
  payerIban: text("payer_iban"),
  variableSymbol: text("variable_symbol"),
  constantSymbol: text("constant_symbol"),
  memo: text("memo"),
  matchedPaymentId: integer("matched_payment_id").references(() => payments.id),
  syncedAt: text("synced_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type BankTransaction = typeof bankTransactions.$inferSelect;

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

// ============ APP SETTINGS (key-value store) ============
export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
