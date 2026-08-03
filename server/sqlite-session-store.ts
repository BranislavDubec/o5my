import session, { type SessionData } from "express-session";
import Database from "better-sqlite3";

interface SQLiteSessionStoreOptions {
  databasePath: string;
  defaultTtlMs: number;
  cleanupIntervalMs: number;
}

interface StoredSessionRow {
  session_data: string;
  expires_at: number;
}

export class SQLiteSessionStore extends session.Store {
  private readonly database: Database.Database;
  private readonly defaultTtlMs: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options: SQLiteSessionStoreOptions) {
    super();
    this.defaultTtlMs = options.defaultTtlMs;
    this.database = new Database(options.databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("busy_timeout = 5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid TEXT PRIMARY KEY,
        session_data TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx
      ON user_sessions(expires_at);
    `);
    this.deleteExpiredSessions();
    this.cleanupTimer = setInterval(() => this.deleteExpiredSessions(), options.cleanupIntervalMs);
    this.cleanupTimer.unref();
  }

  private expirationTime(sessionData: SessionData) {
    const cookieExpiration = sessionData.cookie?.expires;
    if (cookieExpiration) {
      const timestamp = new Date(cookieExpiration).getTime();
      if (!Number.isNaN(timestamp)) return timestamp;
    }
    const cookieMaxAge = sessionData.cookie?.maxAge;
    return Date.now() + (typeof cookieMaxAge === "number" ? cookieMaxAge : this.defaultTtlMs);
  }

  private deleteExpiredSessions() {
    try {
      this.database.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(Date.now());
    } catch (error) {
      this.emit("disconnect", error);
    }
  }

  get(sid: string, callback: (error: unknown, sessionData?: SessionData | null) => void) {
    try {
      const row = this.database.prepare(`
        SELECT session_data, expires_at
        FROM user_sessions
        WHERE sid = ?
      `).get(sid) as StoredSessionRow | undefined;
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        this.database.prepare("DELETE FROM user_sessions WHERE sid = ?").run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.session_data) as SessionData);
    } catch (error) {
      callback(error);
    }
  }

  set(sid: string, sessionData: SessionData, callback?: (error?: unknown) => void) {
    try {
      this.database.prepare(`
        INSERT INTO user_sessions (sid, session_data, expires_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET
          session_data = excluded.session_data,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `).run(
        sid,
        JSON.stringify(sessionData),
        this.expirationTime(sessionData),
        new Date().toISOString(),
      );
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid: string, callback?: (error?: unknown) => void) {
    try {
      this.database.prepare("DELETE FROM user_sessions WHERE sid = ?").run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid: string, sessionData: SessionData, callback?: () => void) {
    try {
      this.database.prepare(`
        UPDATE user_sessions
        SET expires_at = ?, updated_at = ?
        WHERE sid = ?
      `).run(this.expirationTime(sessionData), new Date().toISOString(), sid);
    } catch (error) {
      this.emit("disconnect", error);
    }
    callback?.();
  }

  close() {
    clearInterval(this.cleanupTimer);
    this.database.close();
  }
}
