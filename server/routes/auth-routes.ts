import type { Express } from "express";
import { insertUserSchema } from "@shared/schema";
import { TERMS_VERSION } from "@shared/terms";
import { comparePassword, getCurrentUser, hashPassword, requireAuth } from "../auth";
import {
  resetPasswordWithToken,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendRegistrationCompleteEmail,
  verifyEmailToken,
} from "../email-verification";
import { storage } from "../storage";
import { normalizeNickname, normalizePersonName, splitFullName } from "../user-profile";
import { validateNewPassword } from "../password-policy";

const passwordResetCooldowns = new Map<string, number>();
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

function canSendPasswordReset(email: string) {
  const now = Date.now();
  const previousRequest = passwordResetCooldowns.get(email) ?? 0;
  if (now - previousRequest < PASSWORD_RESET_COOLDOWN_MS) return false;
  passwordResetCooldowns.set(email, now);
  if (passwordResetCooldowns.size > 1_000) {
    for (const [key, requestedAt] of Array.from(passwordResetCooldowns.entries())) {
      if (now - requestedAt > PASSWORD_RESET_COOLDOWN_MS) passwordResetCooldowns.delete(key);
    }
  }
  return true;
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req, res) => {
    try {
      if (req.body?.acceptedTerms !== true) {
        return res.status(400).json({ message: "Je potrebné súhlasiť s podmienkami používania" });
      }
      const legacyName = splitFullName(req.body?.name);
      const firstName = normalizePersonName(req.body?.firstName ?? legacyName.firstName, "Meno");
      const lastName = normalizePersonName(req.body?.lastName ?? legacyName.lastName, "Priezvisko");
      const nickname = normalizeNickname(req.body?.nickname);
      const password = validateNewPassword(req.body?.password);
      const data = insertUserSchema.parse({
        ...req.body,
        password,
        name: `${firstName} ${lastName}`,
        firstName,
        lastName,
        nickname,
      });
      const email = data.email.trim().toLowerCase();
      const existing = storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "Email je už registrovaný" });
      }

      const user = storage.createUser({
        ...data,
        email,
        password: await hashPassword(data.password),
        role: "player",
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date().toISOString(),
      });
      storage.upsertNotificationSettings({ userId: user.id });

      if (storage.getAllUsers().length === 1) {
        storage.updateUserRole(user.id, "admin");
      }

      await sendEmailVerification(user);
      res.status(201).json({
        message: "Skontroluj si email a potvrď registráciu.",
        requiresEmailVerification: true,
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Registrácia zlyhala" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (typeof email !== "string" || !email || !password) {
        return res.status(400).json({ message: "Email a heslo sú povinné" });
      }

      const user = storage.getUserByEmail(email.trim().toLowerCase());
      if (!user || !(await comparePassword(password, user.password))) {
        return res.status(401).json({ message: "Nesprávny email alebo heslo" });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: "Účet je deaktivovaný. Kontaktuj administrátora." });
      }
      if (!user.emailVerified) {
        return res.status(403).json({ message: "Pred prihlásením potvrď svoj email" });
      }

      req.session.userId = user.id;
      req.session.passwordVersion = user.passwordVersion;
      res.json(getCurrentUser(req));
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Prihlásenie zlyhalo" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ message: "Odhlásené" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ message: "Neprihlásený" });
    }
    res.json(user);
  });

  app.post("/api/auth/accept-terms", requireAuth, (req, res) => {
    const user = storage.acceptTerms(req.user!.id, TERMS_VERSION);
    if (!user) return res.status(404).json({ message: "Používateľ nenájdený" });
    const { password, ...safeUser } = user;
    res.json(safeUser);
  });

  app.put("/api/auth/profile", requireAuth, (req, res) => {
    try {
      const firstName = normalizePersonName(req.body?.firstName, "Meno");
      const lastName = normalizePersonName(req.body?.lastName, "Priezvisko");
      const nickname = normalizeNickname(req.body?.nickname);
      const user = storage.updateUserProfile(req.user!.id, firstName, lastName, nickname);
      if (!user) return res.status(404).json({ message: "Používateľ nenájdený" });
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Profil sa nepodarilo uložiť" });
    }
  });

  app.post("/api/auth/forgot-password", (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email && canSendPasswordReset(email)) {
      const user = storage.getUserByEmail(email);
      if (user?.isActive && user.emailVerified) {
        void sendPasswordResetEmail(user).catch(error => {
          storage.deletePasswordResetTokens(user.id);
          console.error("Failed to send password reset email", error);
        });
      }
    }
    res.json({ message: "Ak účet s týmto emailom existuje, poslali sme odkaz na obnovenie hesla." });
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      if (!token) return res.status(400).json({ message: "Odkaz je neplatný alebo expirovaný" });
      const password = validateNewPassword(req.body?.password);
      const user = resetPasswordWithToken(token, await hashPassword(password));
      if (!user) return res.status(400).json({ message: "Odkaz je neplatný alebo expirovaný" });
      res.json({ message: "Heslo bolo zmenené. Teraz sa môžeš prihlásiť." });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Heslo sa nepodarilo zmeniť" });
    }
  });

  app.put("/api/auth/password", requireAuth, async (req, res) => {
    try {
      const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
      const user = storage.getUser(req.user!.id);
      if (!user || !currentPassword || !(await comparePassword(currentPassword, user.password))) {
        return res.status(400).json({ message: "Aktuálne heslo nie je správne" });
      }
      const password = validateNewPassword(req.body?.password);
      if (await comparePassword(password, user.password)) {
        return res.status(400).json({ message: "Nové heslo musí byť odlišné od aktuálneho" });
      }
      const updatedUser = storage.updateUserPassword(user.id, await hashPassword(password));
      if (!updatedUser) return res.status(404).json({ message: "Používateľ nenájdený" });
      storage.deletePasswordResetTokens(user.id);
      req.session.passwordVersion = updatedUser.passwordVersion;
      res.json({ message: "Heslo bolo zmenené" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Heslo sa nepodarilo zmeniť" });
    }
  });

  app.post("/api/auth/verify-email", (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const verifiedUser = token ? verifyEmailToken(token) : null;
    if (!verifiedUser) {
      return res.status(400).json({ message: "Odkaz je neplatný alebo expirovaný" });
    }
    res.json({ message: "Email bol úspešne potvrdený" });

    void sendRegistrationCompleteEmail(verifiedUser).catch(error => {
      console.error("Failed to send registration complete email", error);
    });
  });

  app.post("/api/auth/resend-verification", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const user = email ? storage.getUserByEmail(email) : undefined;

    if (user?.isActive && !user.emailVerified) {
      try {
        await sendEmailVerification(user);
      } catch (error) {
        console.error("Failed to resend verification email", error);
      }
    }

    res.json({ message: "Ak účet čaká na potvrdenie, poslali sme nový email." });
  });
}
