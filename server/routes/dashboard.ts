import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth";

export function registerDashboardRoutes(app: Express) {
  // ============ DASHBOARD STATS ============
  app.get("/api/stats", requireAuth, (req, res) => {
    const users = storage.getAllUsers();
    const events = storage.getAllEvents();
    const polls = storage.getAllPolls();
    const now = new Date().toISOString();
    const upcomingEventsWithAttendance = events
      .filter(event => event.startTime >= now)
      .map(event => ({
        ...event,
        attendanceStatus: storage.getEventResponse(event.id, req.user!.id)?.status ?? null,
      }));
    const activePolls = polls.filter(poll => !poll.closesAt || poll.closesAt >= now);
    const outstandingPayments = storage
      .getPaymentsByUser(req.user!.id)
      .filter(payment => payment.status !== "paid");

    res.json({
      playerCount: users.filter(user => user.isActive).length,
      eventCount: events.length,
      upcomingEvents: upcomingEventsWithAttendance.slice(0, 5),
      unansweredEvents: upcomingEventsWithAttendance
        .filter(event => !event.attendanceStatus)
        .slice(0, 5),
      activePolls: activePolls.length,
      unansweredPolls: activePolls
        .filter(poll => !storage.getUserPollVote(poll.id, req.user!.id))
        .slice(0, 5),
      outstandingPayments,
    });
  });

  // ============ TEAM STATISTICS ============
  app.get("/api/stats/team", requireAuth, (_req, res) => {
    res.json(storage.getTeamStatistics());
  });
}
