import type { Express } from "express";
import type { Server } from "node:http";
import { configureSession } from "./session";
import { registerAuthRoutes } from "./routes/auth-routes";
import { registerMediaRoutes } from "./media-routes";
import { registerEventsRoutes } from "./routes/events";
import { registerPollsRoutes } from "./routes/polls";
import { registerOrganizationRoutes } from "./routes/organization";
import { registerUsersRoutes } from "./routes/users";
import { registerPaymentsRoutes } from "./routes/payments";
import { registerNotificationsRoutes } from "./routes/notifications";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerOpponentsRoutes } from "./routes/opponents";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  configureSession(app);
  registerAuthRoutes(app);
  registerMediaRoutes(app);
  registerEventsRoutes(app);
  registerPollsRoutes(app);
  registerOrganizationRoutes(app);
  registerUsersRoutes(app);
  registerPaymentsRoutes(app);
  registerNotificationsRoutes(app);
  registerDashboardRoutes(app);
  registerOpponentsRoutes(app);

  return httpServer;
}
