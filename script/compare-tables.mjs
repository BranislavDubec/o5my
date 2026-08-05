import { readFileSync } from "node:fs";

const storage = readFileSync("server/storage.ts", "utf8");
const migration = readFileSync("migrations/0000_baseline.sql", "utf8");

const bootstrapTables = [...storage.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/g)]
  .map((m) => m[1])
  .sort();
const migrationTables = [...migration.matchAll(/CREATE TABLE IF NOT EXISTS `([a-z_]+)`/g)]
  .map((m) => m[1])
  .sort();

console.log(`bootstrap (${bootstrapTables.length}): ${bootstrapTables.join(", ")}`);
console.log(`migration (${migrationTables.length}): ${migrationTables.join(", ")}`);

const diff = [
  ...bootstrapTables.filter((t) => !migrationTables.includes(t)),
  ...migrationTables.filter((t) => !bootstrapTables.includes(t)),
];
console.log(diff.length ? `DIFF: ${diff.join(", ")}` : "IDENTICAL");
