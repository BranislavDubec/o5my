import type { Express } from "express";
import session from "express-session";
import { SQLiteSessionStore } from "./sqlite-session-store";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_MS = 7 * ONE_DAY_MS;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function useSecureCookies() {
  if (process.env.SESSION_COOKIE_SECURE !== undefined) {
    return process.env.SESSION_COOKIE_SECURE === "true";
  }
  return process.env.NODE_ENV === "production";
}

export function configureSession(app: Express) {
  const store = new SQLiteSessionStore({
    databasePath: process.env.DATABASE_PATH || "data.db",
    defaultTtlMs: SESSION_MAX_AGE_MS,
    cleanupIntervalMs: SESSION_CLEANUP_INTERVAL_MS,
  });
  app.locals.sessionStore = store;
  app.set("trust proxy", 1);
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "futbal-app-secret-change-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: useSecureCookies(),
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE_MS,
      },
      store,
    }),
  );
  return store;
}
