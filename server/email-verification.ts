import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { storage } from "./storage";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("SMTP nie je nakonfigurované");
  }

  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
  });
}

export async function sendEmailVerification(user: { id: number; email: string; name: string }) {
  const token = randomBytes(32).toString("hex");
  storage.createEmailVerificationToken(
    user.id,
    hashToken(token),
    new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  );

  const appUrl = (process.env.APP_URL || "http://localhost:5000").replace(/\/$/, "");
  const verificationUrl = `${appUrl}/?token=${encodeURIComponent(token)}#/verify-email`;
  const safeName = escapeHtml(user.name);

  await createTransport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: user.email,
    subject: "Potvrď svoj email – Futbal Tím",
    text: `Ahoj ${user.name}, potvrď svoj email otvorením tohto odkazu: ${verificationUrl}\n\nOdkaz platí 24 hodín.`,
    html: `<p>Ahoj ${safeName},</p><p>potvrď svoj email kliknutím na odkaz:</p><p><a href="${verificationUrl}">Potvrdiť email</a></p><p>Odkaz platí 24 hodín.</p>`,
  });
}

export function verifyEmailToken(token: string) {
  const record = storage.getEmailVerificationToken(hashToken(token));
  if (!record || new Date(record.expiresAt).getTime() <= Date.now()) {
    return false;
  }

  storage.markUserEmailVerified(record.userId);
  storage.deleteEmailVerificationTokens(record.userId);
  return true;
}
