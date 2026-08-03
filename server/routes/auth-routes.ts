import type { Express } from "express";
import { insertUserSchema } from "@shared/schema";
import { comparePassword, getCurrentUser, hashPassword, requireAuth } from "../auth";
import { sendEmailVerification, sendRegistrationCompleteEmail, verifyEmailToken } from "../email-verification";
import { storage } from "../storage";
import { normalizeNickname, normalizePersonName, splitFullName } from "../user-profile";

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const legacyName = splitFullName(req.body?.name);
      const firstName = normalizePersonName(req.body?.firstName ?? legacyName.firstName, "Meno");
      const lastName = normalizePersonName(req.body?.lastName ?? legacyName.lastName, "Priezvisko");
      const nickname = normalizeNickname(req.body?.nickname);
      const data = insertUserSchema.parse({
        ...req.body,
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
