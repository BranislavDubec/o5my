import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import { insertOpponentSchema, updateOpponentSchema } from "@shared/schema";

export function registerOpponentsRoutes(app: Express) {
  // ============ OPPONENTS ============
  app.get("/api/opponents", requireAuth, (_req, res) => {
    const allOpponents = storage.getAllOpponents();
    res.json(allOpponents);
  });

  app.post("/api/opponents", requireAuth, (req, res) => {
    try {
      const data = insertOpponentSchema.parse(req.body);

      const opponent = storage.createOpponent(data);

      return res.status(201).json(opponent);
    } catch (error) {
      console.error("Failed to create opponent:", error);

      return res.status(500).json({
        message: "Súpera sa nepodarilo pridať",
      });
    }
  });

  app.patch("/api/opponents/:id", requireAuth, (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          message: "Neplatné ID súpera",
        });
      }

      const data = updateOpponentSchema.parse(req.body);

      const opponent = storage.updateOpponent(id, data);
      if (!opponent) {
        return res.status(404).json({
          message: "Súper nebol nájdený",
        });
      }

      return res.json(opponent);
    } catch (err: any) {
      return res.status(400).json({
        message: err.message,
      });
    }
  });

  app.delete("/api/opponents/:id", requireAuth, (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          message: "Neplatné ID súpera",
        });
      }

      storage.deleteOpponent(id);

      return res.status(204).send();
    } catch (err: any) {
      return res.status(400).json({
        message: err.message,
      });
    }
  });
}
