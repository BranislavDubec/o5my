import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireManager } from "../auth";
import { insertPollSchema } from "@shared/schema";

function normalizeCustomOptions(input: unknown) {
  if (!Array.isArray(input)) throw new Error("Možnosti ankety musia byť zoznam");
  const labels = input.map(value => typeof value === "string" ? value.trim() : "").filter(Boolean);
  if (labels.length < 2 || labels.length > 50) {
    throw new Error("Anketa musí mať 2 až 50 možností");
  }
  if (labels.some(label => label.length > 150)) {
    throw new Error("Možnosť môže mať najviac 150 znakov");
  }
  if (new Set(labels.map(label => label.toLocaleLowerCase())).size !== labels.length) {
    throw new Error("Možnosti ankety sa nemôžu opakovať");
  }
  return labels;
}

function getMemberOptionLabels(input: unknown) {
  if (!Array.isArray(input)) throw new Error("Vyber členov ankety");
  const memberIds = Array.from(new Set(input.map(value => Number(value))));
  if (memberIds.length < 2 || memberIds.length > 500 || memberIds.some(id => !Number.isInteger(id) || id <= 0)) {
    throw new Error("Vyber 2 až 500 platných členov");
  }

  const eligibleMembers = new Map(
    storage.getAllUsers()
      .filter(user => user.isActive && user.emailVerified)
      .map(user => [user.id, user]),
  );
  const selectedMembers = memberIds.map(id => eligibleMembers.get(id));
  if (selectedMembers.some(member => !member)) {
    throw new Error("Niektorý vybraný člen nie je aktívny alebo overený");
  }
  return selectedMembers.map(member => member!.name);
}

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
    const allVotes = storage.getPollVotes(poll.id);
    const userVotes = storage.getUserPollVotes(poll.id, req.user!.id);
    const canRevealAnonymousResults = req.user?.role === "admin" && req.query.revealResults === "1";
    const shouldHideResults = poll.isAnonymous && !canRevealAnonymousResults;
    const results = shouldHideResults
      ? []
      : options.map(option => ({
        optionId: option.id,
        count: allVotes.filter(vote => vote.optionId === option.id).length,
      }));
    res.json({
      ...poll,
      options,
      votes: poll.isAnonymous ? [] : allVotes,
      results,
      totalVotes: new Set(allVotes.map(vote => vote.userId)).size,
      userVote: userVotes[0] ? { id: userVotes[0].id, optionId: userVotes[0].optionId } : null,
      userVotes: userVotes.map(vote => ({ id: vote.id, optionId: vote.optionId })),
    });
  });

  app.post("/api/polls", requireManager, (req, res) => {
    try {
      const { options, memberIds, optionMode, ...pollData } = req.body ?? {};
      const optionLabels = optionMode === "members"
        ? getMemberOptionLabels(memberIds)
        : normalizeCustomOptions(options);
      const data = insertPollSchema.parse({
        ...pollData,
        isAnonymous: req.body?.isAnonymous === true,
        allowMultipleResponses: req.body?.allowMultipleResponses === true,
        createdBy: req.user!.id,
      });
      const poll = storage.createPoll(data);
      storage.createPollOptions(
        optionLabels.map(label => ({ pollId: poll.id, label })),
      );
      res.status(201).json(poll);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/polls/:id", requireManager, (req, res) => {
    storage.deletePoll(Number(req.params.id));
    res.json({ message: "Anketa zmazaná" });
  });

  app.put("/api/polls/:id", requireManager, (req, res) => {
    const pollId = Number(req.params.id);
    if (!Number.isInteger(pollId)) return res.status(400).json({ message: "Neplatné ID ankety" });
    if (typeof req.body?.allowMultipleResponses !== "boolean") {
      return res.status(400).json({ message: "Neplatné nastavenie ankety" });
    }
    const poll = storage.updatePoll(pollId, { allowMultipleResponses: req.body.allowMultipleResponses });
    if (!poll) return res.status(404).json({ message: "Anketa nenájdená" });
    res.json(poll);
  });

  // ============ POLL VOTES ============
  app.post("/api/polls/:id/votes", requireAuth, (req, res) => {
    const pollId = Number(req.params.id);
    const rawOptionIds: unknown[] = Array.isArray(req.body?.optionIds) ? req.body.optionIds : [req.body?.optionId];
    const optionIds: number[] = Array.from(new Set(rawOptionIds.map(value => Number(value))));
    if (!Number.isInteger(pollId) || optionIds.length === 0 || optionIds.some(id => !Number.isInteger(id))) {
      return res.status(400).json({ message: "Neplatná anketa alebo možnosť" });
    }
    const poll = storage.getPoll(pollId);
    if (!poll) return res.status(404).json({ message: "Anketa nenájdená" });
    if (poll.closesAt && new Date(poll.closesAt).getTime() < Date.now()) {
      return res.status(409).json({ message: "Anketa je už uzavretá" });
    }
    const pollOptionIds = new Set(storage.getPollOptions(pollId).map(option => option.id));
    if (optionIds.some(optionId => !pollOptionIds.has(optionId))) {
      return res.status(400).json({ message: "Možnosť nepatrí do tejto ankety" });
    }
    if (!poll.allowMultipleResponses && optionIds.length !== 1) {
      return res.status(400).json({ message: "Táto anketa umožňuje iba jednu odpoveď" });
    }
    if (poll.allowMultipleResponses && optionIds.length === 1) {
      storage.togglePollVote(pollId, req.user!.id, optionIds[0]);
    } else {
      storage.setPollVotes(pollId, req.user!.id, optionIds);
    }
    res.json({ message: "Hlas zaznamenaný" });
  });
}
