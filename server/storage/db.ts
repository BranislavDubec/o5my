import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sqlite = new Database(
  process.env.DATABASE_PATH || "data.db"
);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Apply pending migrations on startup. In production the migrations folder is
// bundled next to the compiled output (dist/migrations); in development it
// lives in the project root.
// `__filename` exists in the CJS production bundle; `import.meta.url` is used
// in ESM dev (native Node or tsx), where `__filename` is undefined.
// This file lives one level deeper than the old server/storage.ts, so several
// candidate locations are checked.
const moduleDir =
  typeof __filename !== "undefined"
    ? path.dirname(__filename)
    : path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = [
  path.resolve(moduleDir, "migrations"),
  path.resolve(moduleDir, "../migrations"),
  path.resolve(moduleDir, "../../migrations"),
].find(candidate => existsSync(path.resolve(candidate, "meta/_journal.json")));
if (!migrationsFolder) {
  throw new Error("Nepodarilo sa nájsť priečinok s migráciami");
}
migrate(db, { migrationsFolder });

export { sqlite };
