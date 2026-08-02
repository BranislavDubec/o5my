import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { storage } from "./storage";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const LOGO_CID = "o5my-team-logo";

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

function getAppUrl() {
  return (process.env.APP_URL || "http://localhost:5000").replace(/\/$/, "");
}

function getLogoAttachments() {
  const logoPath = [
    path.resolve("dist/public/logo.jpg"),
    path.resolve("client/public/logo.jpg"),
  ].find(existsSync);

  return logoPath
    ? [{ filename: "o5my-logo.jpg", path: logoPath, cid: LOGO_CID }]
    : [];
}

function emailLayout(content: string) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b;">
    <div style="padding:32px 16px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:36px 32px;text-align:center;">
        <img src="cid:${LOGO_CID}" alt="O5MY" width="110" style="display:block;margin:0 auto 24px;max-width:110px;height:auto;" />
        ${content}
      </div>
    </div>
  </body>
</html>`;
}

function emailButton(label: string, url: string) {
  return `<a href="${url}" style="display:inline-block;margin:8px 0 24px;padding:14px 28px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">${label}</a>`;
}

export async function sendEmailVerification(user: { id: number; email: string; name: string }) {
  const token = randomBytes(32).toString("hex");
  storage.createEmailVerificationToken(
    user.id,
    hashToken(token),
    new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  );

  const appUrl = getAppUrl();
  const verificationUrl = `${appUrl}/?token=${encodeURIComponent(token)}#/verify-email`;
  const safeName = escapeHtml(user.name);

  await createTransport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: user.email,
    subject: "⏳ You’re almost there | Confirm sign-up",
    text: `Hi ${user.name},\n\nYou’re only one click away from joining the squad. We’ve saved your place in the starting eleven—now let’s make it official.\n\nConfirm your sign-up: ${verificationUrl}\n\nThis link is valid for 24 hours.\n\nNo warm-up needed. Just one click. ⚽\n\nSee you on the pitch,\nThe O5MY Team`,
    html: emailLayout(`
      <h1 style="margin:0 0 16px;font-size:26px;">Hi ${safeName}! 👋</h1>
      <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">You’re only one click away from joining the squad.</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">We’ve saved your place in the starting eleven—now let’s make it official.</p>
      ${emailButton("Confirm my sign-up", verificationUrl)}
      <p style="margin:0 0 20px;color:#71717a;font-size:13px;">This link is valid for 24 hours.</p>
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;">No warm-up needed. Just one click. ⚽</p>
      <p style="margin:20px 0 0;color:#52525b;font-size:14px;line-height:1.5;">See you on the pitch,<br />The O5MY Team</p>
    `),
    attachments: getLogoAttachments(),
  });
}

export function verifyEmailToken(token: string) {
  const record = storage.getEmailVerificationToken(hashToken(token));
  if (!record || new Date(record.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const user = storage.markUserEmailVerified(record.userId);
  storage.deleteEmailVerificationTokens(record.userId);
  return user || null;
}

export async function sendRegistrationCompleteEmail(user: { email: string; name: string }) {
  const appUrl = getAppUrl();
  const safeName = escapeHtml(user.name);

  await createTransport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: user.email,
    subject: "✅ Your registration is complete!",
    text: `Welcome to the team, ${user.name}!\n\nYour registration is complete and your digital jersey is ready. You can now check upcoming fixtures, confirm your attendance, vote in team polls, and keep up with payments.\n\nOpen the team app: ${appUrl}\n\nThe team sheet is official—you’re on it. ⚽\n\nSee you on the pitch,\nThe O5MY Team`,
    html: emailLayout(`
      <h1 style="margin:0 0 16px;font-size:26px;">Welcome to the team, ${safeName}! ⚽</h1>
      <p style="margin:0 0 12px;font-size:16px;line-height:1.6;">Your registration is complete and your digital jersey is ready.</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">You can now check upcoming fixtures, confirm your attendance, vote in team polls, and keep up with payments.</p>
      ${emailButton("Open the team app", appUrl)}
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;">The team sheet is official—you’re on it. 🙌</p>
      <p style="margin:20px 0 0;color:#52525b;font-size:14px;line-height:1.5;">See you on the pitch,<br />The O5MY Team</p>
    `),
    attachments: getLogoAttachments(),
  });
}
