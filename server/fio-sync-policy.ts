export const FIO_AUTO_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1_000;

export function isFioAutoSyncDue(
  lastSuccessfulSync: string | undefined,
  now = Date.now(),
): boolean {
  if (!lastSuccessfulSync) return true;
  const lastSyncTime = Date.parse(lastSuccessfulSync);
  if (!Number.isFinite(lastSyncTime)) return true;
  return now - lastSyncTime >= FIO_AUTO_SYNC_INTERVAL_MS;
}
