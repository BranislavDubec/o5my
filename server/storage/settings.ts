import { eq } from "drizzle-orm";
import { appSettings } from '@shared/schema';
import { db } from "./db";

export class AppSettingsStore {
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
}
