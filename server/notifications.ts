import webpush, { type PushSubscription, WebPushError } from "web-push";
import { isEmailConfigured, sendAppNotificationEmail } from "./email-verification";
import { storage } from "./storage";

export interface AppNotification {
  title: string;
  body: string;
  path: string;
  tag: string;
  emailSubject: string;
  emailHeading?: string;
  emailButtonLabel?: string;
}

export interface NotificationDeliveryOptions {
  push?: boolean;
  email?: boolean;
}

let vapidConfigured = false;

function getVapidKeys() {
  const environmentPublicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const environmentPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (environmentPublicKey && environmentPrivateKey) {
    return { publicKey: environmentPublicKey, privateKey: environmentPrivateKey };
  }

  const storedPublicKey = storage.getAppSetting("vapid_public_key");
  const storedPrivateKey = storage.getAppSetting("vapid_private_key");
  if (storedPublicKey && storedPrivateKey) {
    return { publicKey: storedPublicKey, privateKey: storedPrivateKey };
  }

  const generated = webpush.generateVAPIDKeys();
  storage.setAppSetting("vapid_public_key", generated.publicKey);
  storage.setAppSetting("vapid_private_key", generated.privateKey);
  return generated;
}

function configureVapid() {
  const keys = getVapidKeys();
  if (!vapidConfigured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || "mailto:noreply@o5my.app",
      keys.publicKey,
      keys.privateKey,
    );
    vapidConfigured = true;
  }
  return keys;
}

export function getVapidPublicKey() {
  return configureVapid().publicKey;
}

async function sendPushToUser(userId: number, notification: AppNotification) {
  configureVapid();
  const subscriptions = storage.getPushSubscriptionsByUser(userId);
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: notification.path,
    tag: notification.tag,
    icon: "/android-chrome-192x192.png",
    badge: "/android-chrome-192x192.png",
  });

  await Promise.all(subscriptions.map(async record => {
    try {
      const subscription = JSON.parse(record.subscription) as PushSubscription;
      await webpush.sendNotification(subscription, payload, {
        TTL: 60 * 60 * 24,
        urgency: "high",
        topic: notification.tag.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32),
      });
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof WebPushError && [404, 410].includes(error.statusCode))) {
        storage.deletePushSubscriptionByEndpoint(record.endpoint);
        return;
      }
      throw error;
    }
  }));
}

export async function notifyUsers(
  userIds: number[],
  notification: AppNotification,
  delivery: NotificationDeliveryOptions = {},
) {
  const uniqueUserIds = Array.from(new Set(userIds));
  const users = uniqueUserIds
    .map(userId => storage.getUser(userId))
    .filter(user => user?.isActive && user.emailVerified);

  const results = await Promise.allSettled(users.map(async user => {
    if (!user) return;
    const settings = storage.getNotificationSettings(user.id);
    const deliveries: Promise<unknown>[] = [];

    if (delivery.push !== false && (settings?.pushEnabled ?? true)) {
      deliveries.push(sendPushToUser(user.id, notification));
    }
    if (delivery.email !== false && (settings?.emailEnabled ?? true) && isEmailConfigured()) {
      deliveries.push(sendAppNotificationEmail({
        to: user.email,
        name: user.name,
        subject: notification.emailSubject,
        heading: notification.emailHeading || notification.title,
        message: notification.body,
        buttonLabel: notification.emailButtonLabel || "Otvoriť aplikáciu",
        path: notification.path,
      }));
    }

    await Promise.all(deliveries);
  }));

  results.forEach(result => {
    if (result.status === "rejected") {
      console.error("Notification delivery failed", result.reason);
    }
  });
}
