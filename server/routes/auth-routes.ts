import type { Express } from "express";
import { insertUserSchema } from "@shared/schema";
import { comparePassword, getCurrentUser, hashPassword } from "../auth";
import { sendEmailVerification, verifyEmailToken } from "../email-verification";
import { storage } from "../storage";

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
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

  app.post("/api/auth/verify-email", (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (!token || !verifyEmailToken(token)) {
      return res.status(400).json({ message: "Odkaz je neplatný alebo expirovaný" });
    }
    res.json({ message: "Email bol úspešne potvrdený" });
  });

  app.post("/api/auth/resend-verification", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const user = email ? storage.getUserByEmail(email) : undefined;

    if (user && !user.emailVerified) {
      try {
        await sendEmailVerification(user);
      } catch (error) {
        console.error("Failed to resend verification email", error);
      }
    }

    res.json({ message: "Ak účet čaká na potvrdenie, poslali sme nový email." });
  });
}
