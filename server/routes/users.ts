import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../auth";
import { updateGoogleCalendarEventAttendance } from "../google-calendar";

function refreshFutureMatchAttendance(userId: number) {
  const now = Date.now();
  const matches = storage.getAllEvents().filter(event => (
    event.type === "match"
    && Boolean(event.externalId)
    && new Date(event.startTime).getTime() > now
    && Boolean(storage.getEventResponse(event.id, userId))
  ));

  void (async () => {
    for (const event of matches) {
      const responses = storage.getEventResponses(event.id).filter(response => {
        const user = storage.getUser(response.userId);
        return user?.isActive === true && user.isPlayerActive && user.emailVerified;
      });
      try {
        await updateGoogleCalendarEventAttendance(event, responses);
      } catch (error: any) {
        console.error(
          `Failed to refresh Google Calendar attendance for event ${event.id}`,
          error?.message || error,
        );
      }
    }
  })();
}

export function registerUsersRoutes(app: Express) {
  // ============ PLAYER STATISTICS ============
  app.get("/api/statistics", requireAuth, (_req, res) => {
    res.json(storage.getPlayerStatistics());
  });

  app.patch("/api/statistics/:userId", requireAdmin, (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const goalsDelta = Number(req.body?.goalsDelta ?? 0);
      const assistsDelta = Number(req.body?.assistsDelta ?? 0);
      if (!Number.isInteger(userId)) return res.status(400).json({ message: "Neplatné ID hráča" });
      if (![-1, 0, 1].includes(goalsDelta) || ![-1, 0, 1].includes(assistsDelta) || (goalsDelta === 0 && assistsDelta === 0)) {
        return res.status(400).json({ message: "Naraz možno pridať alebo odobrať jeden gól či asistenciu" });
      }
      const statistic = storage.adjustPlayerStatistics(userId, goalsDelta, assistsDelta);
      if (!statistic) return res.status(404).json({ message: "Aktívny hráč nebol nájdený" });
      res.json(statistic);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Štatistiku sa nepodarilo upraviť" });
    }
  });

  // ============ USERS ============
  app.get("/api/users", requireAuth, (req, res) => {
    const allUsers = storage.getAllUsers();
    if (req.user!.role === "admin") {
      const walletBalances = storage.getWalletBalances();
      const walletCurrency = storage.getAppSetting("payment_currency") || "CZK";
      return res.json(allUsers.map(({ password, ...user }) => ({
        ...user,
        walletBalance: walletBalances.get(user.id) ?? 0,
        walletCurrency,
      })));
    }

    res.json(allUsers
      .filter(user => user.isActive && user.emailVerified)
      .map(user => ({
        id: user.id,
        name: user.name,
        nickname: user.nickname,
        role: user.role,
        isActive: user.isActive,
        isPlayerActive: user.isPlayerActive,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      })));
  });

  app.put("/api/users/:id/role", requireAdmin, (req, res) => {
    const { role } = req.body;
    if (!["admin", "player"].includes(role)) {
      return res.status(400).json({ message: "Neplatná rola" });
    }
    const user = storage.updateUserRole(Number(req.params.id), role);
    if (!user) return res.status(404).json({ message: "Používateľ nenájdený" });
    const { password, ...safe } = user;
    res.json(safe);
  });

  app.put("/api/users/:id/status", requireAdmin, (req, res) => {
    const userId = Number(req.params.id);
    if (userId === req.user!.id) {
      return res.status(400).json({ message: "Nemôžete deaktivovať vlastný účet" });
    }

    if (typeof req.body?.isActive !== "boolean") {
      return res.status(400).json({ message: "Neplatný stav účtu" });
    }

    const user = storage.updateUserActiveStatus(userId, req.body.isActive);
    if (!user) return res.status(404).json({ message: "Používateľ nenájdený" });
    refreshFutureMatchAttendance(userId);

    const { password, ...safe } = user;
    res.json(safe);
  });

  app.put("/api/users/:id/player-active", requireAdmin, (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Neplatné ID používateľa" });
    }
    if (typeof req.body?.isPlayerActive !== "boolean") {
      return res.status(400).json({ message: "Neplatný stav hráča" });
    }

    const user = storage.updateUserPlayerStatus(userId, req.body.isPlayerActive);
    if (!user) return res.status(404).json({ message: "Používateľ nenájdený" });
    refreshFutureMatchAttendance(userId);

    const { password, ...safe } = user;
    res.json(safe);
  });

  app.post("/api/users/:id/verify-email", requireAdmin, (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Neplatné ID používateľa" });
    }

    const existing = storage.getUser(userId);
    if (!existing) return res.status(404).json({ message: "Používateľ nenájdený" });

    const user = existing.emailVerified ? existing : storage.markUserEmailVerified(userId);
    if (!user) return res.status(404).json({ message: "Používateľ nenájdený" });
    storage.deleteEmailVerificationTokens(userId);
    if (!existing.emailVerified) refreshFutureMatchAttendance(userId);

    const { password, ...safe } = user;
    res.json(safe);
  });

  // ============ THEME ============
  app.put("/api/settings/theme", requireAuth, (req, res) => {
    const { theme } = req.body;
    if (theme !== "light" && theme !== "dark") {
      return res.status(400).json({ message: "Neplatný farebný režim" });
    }

    const user = storage.updateUserTheme(req.user!.id, theme);
    if (!user) {
      return res.status(404).json({ message: "Používateľ nenájdený" });
    }

    res.json({ theme: user.theme });
  });
}
