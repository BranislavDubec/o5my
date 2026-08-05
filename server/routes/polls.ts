import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../auth";
import { insertPollSchema } from "@shared/schema";

export function registerPollsRoutes(app: Express) {
  // ============ POLLS ============
  app.get("/api/polls", requireAuth, (_req, res) => {
    const allPolls = storage.getAllPolls();
    res.json(allPolls);
  });

  app.get("/api/polls/:id", requireAuth, (req, res) => {
    const poll = storage.getPoll(Number(req.params.id));
    if (!poll) return res.status(404).json({ message: "Anketa nenájdená" });
    const options = storage.getPollOptions(poll.id);
    const votes = storage.getPollVotes(poll.id);
    const userVote = storage.getUserPollVote(poll.id, req.user!.id);
    res.json({ ...poll, options, votes, userVote });
  });

  app.post("/api/polls", requireAdmin, (req, res) => {
    try {
      const { options, ...pollData } = req.body;
      const data = insertPollSchema.parse({
        ...pollData,
        createdBy: req.user!.id,
      });
      const poll = storage.createPoll(data);
      if (options && Array.isArray(options)) {
        storage.createPollOptions(
          options.map((label: string) => ({ pollId: poll.id, label }))
        );
      }
      res.status(201).json(poll);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/polls/:id", requireAdmin, (req, res) => {
    storage.deletePoll(Number(req.params.id));
    res.json({ message: "Anketa zmazaná" });
  });

  // ============ POLL VOTES ============
  app.post("/api/polls/:id/votes", requireAuth, (req, res) => {
    const pollId = Number(req.params.id);
    const { optionId } = req.body;
    if (!optionId) {
      return res.status(400).json({ message: "Option ID je povinné" });
    }
    storage.upsertPollVote({
      pollId,
      optionId: parseInt(optionId),
      userId: req.user!.id,
    });
    res.json({ message: "Hlas zaznamenaný" });
  });
}
