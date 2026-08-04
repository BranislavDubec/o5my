#!/bin/sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="/data/data-before-write-${timestamp}.db"

BACKUP_PATH="$backup_path" node -e '
  const Database = require("better-sqlite3");
  const database = new Database("/data/data.db");
  database.backup(process.env.BACKUP_PATH)
    .then(() => console.log(`Backup created: ${process.env.BACKUP_PATH}`))
    .catch(error => {
      console.error("Backup failed:", error);
      process.exit(1);
    });
'

export SQLITE_HISTORY=/tmp/.sqlite_history
exec sqlite3 \
  -cmd ".headers on" \
  -cmd ".mode column" \
  -cmd ".timeout 5000" \
  -cmd "PRAGMA foreign_keys=ON;" \
  /data/data.db
