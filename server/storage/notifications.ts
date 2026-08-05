import { eq, and } from "drizzle-orm";
import {
  notificationSettings,
  pushSubscriptions,
} from '@shared/schema';
import type {
  NotificationSettings,
  InsertNotificationSettings,
  PushSubscriptionRecord,
} from '@shared/schema';
import { db } from "./db";

export class NotificationStore {
  // ============ NOTIFICATION SETTINGS ============
  getNotificationSettings(userId: number): NotificationSettings | undefined {
    return db.select().from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .get();
  }

  upsertNotificationSettings(settings: Partial<InsertNotificationSettings> & { userId: number }): void {
    const existing = this.getNotificationSettings(settings.userId);
    if (existing) {
      db.update(notificationSettings)
        .set(settings)
        .where(eq(notificationSettings.id, existing.id))
        .run();
    } else {
      db.insert(notificationSettings).values({
        userId: settings.userId,
        pushEnabled: settings.pushEnabled ?? true,
        emailEnabled: settings.emailEnabled ?? true,
        pushSubscription: settings.pushSubscription,
      }).run();
    }
  }

  getPushSubscriptionsByUser(userId: number): PushSubscriptionRecord[] {
    return db.select().from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .all();
  }

  upsertPushSubscription(userId: number, endpoint: string, subscription: string): PushSubscriptionRecord {
    const existing = db.select().from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .get();
    const updatedAt = new Date().toISOString();

    if (existing) {
      return db.update(pushSubscriptions)
        .set({ userId, subscription, updatedAt })
        .where(eq(pushSubscriptions.id, existing.id))
        .returning()
        .get();
    }

    return db.insert(pushSubscriptions)
      .values({ userId, endpoint, subscription, updatedAt })
      .returning()
      .get();
  }

  deletePushSubscription(userId: number, endpoint: string): void {
    db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
      .run();
  }

  deletePushSubscriptionByEndpoint(endpoint: string): void {
    db.delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .run();
  }
}
