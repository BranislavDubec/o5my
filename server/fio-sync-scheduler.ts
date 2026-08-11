import { syncFioTransactions } from "./fio-api";
import { isFioAutoSyncDue } from "./fio-sync-policy";
import { storage } from "./storage";

const FIO_SYNC_CHECK_INTERVAL_MS = 60 * 60 * 1_000;

let scheduler: ReturnType<typeof setInterval> | undefined;
let scheduledSyncRunning = false;

export async function runScheduledFioSyncIfDue(now = Date.now()): Promise<boolean> {
  const token = storage.getAppSetting("fio_token");
  if (!token || scheduledSyncRunning) return false;
  if (!isFioAutoSyncDue(storage.getAppSetting("fio_last_sync"), now)) return false;

  scheduledSyncRunning = true;
  try {
    const result = await syncFioTransactions(token);
    console.info(
      `[Fio sync] Automatic weekly synchronization completed: ${result.synced} imported, ${result.matched} matched`,
    );
  } catch {
    // syncFioTransactions persists and logs the sanitized failure. The hourly
    // scheduler check will retry while the last successful sync remains stale.
  } finally {
    scheduledSyncRunning = false;
  }
  return true;
}

export function startFioSyncScheduler(): void {
  if (scheduler) return;

  void runScheduledFioSyncIfDue();
  scheduler = setInterval(() => {
    void runScheduledFioSyncIfDue();
  }, FIO_SYNC_CHECK_INTERVAL_MS);
  scheduler.unref();
}
