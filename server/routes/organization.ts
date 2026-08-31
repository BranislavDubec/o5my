import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireManager } from "../auth";
import { insertTeamResponsibilitySchema, insertTeamInventoryItemSchema } from "@shared/schema";
import { notifyUsers } from "../notifications";

function parseTeamResponsibility(body: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const section = typeof input.section === "string" ? input.section.trim() : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const kind = typeof input.kind === "string" ? input.kind : "responsibility";
  const status = typeof input.status === "string" ? input.status : "ok";
  const owner = typeof input.owner === "string" ? input.owner.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const location = typeof input.location === "string" ? input.location.trim() : "";
  const parseQuantity = (value: unknown, label: string) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
      throw new Error(`${label} musí byť celé nezáporné číslo`);
    }
    return parsed;
  };
  const quantity = parseQuantity(input.quantity, "Počet");
  const usableQuantity = parseQuantity(input.usableQuantity, "Počet použiteľných kusov");
  const rawOwnerIds = Array.isArray(input.ownerIds) ? input.ownerIds : [];
  const ownerIds = Array.from(new Set(rawOwnerIds.map(Number)));

  if (!section || section.length > 80) {
    throw new Error("Oblasť je povinná a môže mať najviac 80 znakov");
  }
  if (!title || title.length > 160) {
    throw new Error("Názov je povinný a môže mať najviac 160 znakov");
  }
  if (!["responsibility", "inventory"].includes(kind)) {
    throw new Error("Neplatný typ položky");
  }
  if (!["ok", "attention", "done"].includes(status)) {
    throw new Error("Neplatný stav položky");
  }
  if (owner.length > 160) {
    throw new Error("Zodpovedná osoba môže mať najviac 160 znakov");
  }
  if (notes.length > 10_000) {
    throw new Error("Poznámky môžu mať najviac 10 000 znakov");
  }
  if (location.length > 200) {
    throw new Error("Umiestnenie môže mať najviac 200 znakov");
  }
  if (usableQuantity !== null && quantity !== null && usableQuantity > quantity) {
    throw new Error("Počet použiteľných kusov nemôže byť vyšší ako celkový počet");
  }
  if (ownerIds.length > 50 || ownerIds.some(id => !Number.isInteger(id))) {
    throw new Error("Neplatný výber zodpovedných členov");
  }
  if (ownerIds.some(id => !storage.getUser(id)?.isActive)) {
    throw new Error("Zodpovedať môže iba aktívny člen");
  }

  return {
    data: insertTeamResponsibilitySchema.parse({
      section,
      title,
      kind,
      status,
      owner: owner || null,
      notes: notes || null,
      quantity: kind === "inventory" ? quantity : null,
      usableQuantity: kind === "inventory" ? usableQuantity : null,
      location: kind === "inventory" ? location || null : null,
    }),
    ownerIds,
  };
}

function parseTeamInventoryItem(body: unknown, responsibilityId: number) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const status = typeof input.status === "string" ? input.status : "ok";
  const location = typeof input.location === "string" ? input.location.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const parseQuantity = (value: unknown, label: string) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
      throw new Error(`${label} musí byť celé nezáporné číslo`);
    }
    return parsed;
  };
  const quantity = parseQuantity(input.quantity, "Počet");
  const usableQuantity = parseQuantity(input.usableQuantity, "Počet použiteľných kusov");

  if (!name || name.length > 160) {
    throw new Error("Názov veci je povinný a môže mať najviac 160 znakov");
  }
  if (!["ok", "attention", "done"].includes(status)) {
    throw new Error("Neplatný stav inventárnej položky");
  }
  if (location.length > 200) {
    throw new Error("Umiestnenie môže mať najviac 200 znakov");
  }
  if (notes.length > 2_000) {
    throw new Error("Poznámka môže mať najviac 2 000 znakov");
  }
  if (usableQuantity !== null && quantity !== null && usableQuantity > quantity) {
    throw new Error("Počet použiteľných kusov nemôže byť vyšší ako celkový počet");
  }

  return insertTeamInventoryItemSchema.parse({
    responsibilityId,
    name,
    status,
    quantity,
    usableQuantity,
    location: location || null,
    notes: notes || null,
  });
}

export function registerOrganizationRoutes(app: Express) {
  // ============ TEAM ORGANIZATION ============
  app.get("/api/organization", requireAuth, (_req, res) => {
    res.json(storage.getTeamResponsibilities());
  });

  app.post("/api/organization", requireManager, (req, res) => {
    try {
      const { data, ownerIds } = parseTeamResponsibility(req.body);
      const responsibility = storage.createTeamResponsibility(data, ownerIds);
      res.status(201).json(responsibility);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Položku sa nepodarilo vytvoriť" });
    }
  });

  app.put("/api/organization/order", requireManager, (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
      if (ids.some((id: number) => !Number.isInteger(id))) {
        return res.status(400).json({ message: "Neplatné poradie položiek" });
      }
      storage.reorderTeamResponsibilities(ids);
      res.json({ message: "Poradie bolo uložené" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Poradie sa nepodarilo uložiť" });
    }
  });

  app.put("/api/organization/:id", requireManager, (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ message: "Neplatné ID položky" });
      const { data, ownerIds } = parseTeamResponsibility(req.body);
      const responsibility = storage.updateTeamResponsibility(id, data, ownerIds);
      if (!responsibility) return res.status(404).json({ message: "Položka nebola nájdená" });
      res.json(responsibility);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Položku sa nepodarilo upraviť" });
    }
  });

  app.delete("/api/organization/:id", requireManager, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Neplatné ID položky" });
    if (!storage.deleteTeamResponsibility(id)) {
      return res.status(404).json({ message: "Položka nebola nájdená" });
    }
    res.json({ message: "Položka bola zmazaná" });
  });

  app.post("/api/organization/:id/remind", requireManager, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Neplatné ID položky" });
    const responsibility = storage.getTeamResponsibility(id);
    if (!responsibility) return res.status(404).json({ message: "Položka nebola nájdená" });
    const recipientIds = responsibility.owners
      .filter(owner => {
        const recipient = storage.getUser(owner.id);
        return recipient?.isActive && recipient.emailVerified;
      })
      .map(owner => owner.id);
    if (recipientIds.length === 0) {
      return res.status(400).json({ message: "Najprv priraď aspoň jedného aktívneho člena s potvrdeným účtom" });
    }
    const reminderBody = responsibility.notes
      ? `${responsibility.notes.slice(0, 500)}${responsibility.notes.length > 500 ? "…" : ""}`
      : `Skontroluj položku „${responsibility.title}“ v tímovej organizácii.`;

    await notifyUsers(recipientIds, {
      title: `Pripomienka: ${responsibility.title}`,
      body: reminderBody,
      path: "/#/organization",
      tag: `organization-${responsibility.id}-${Date.now().toString(36)}`,
      emailSubject: `🔔 ${responsibility.title} | O5MY Futsal`,
      emailHeading: `Pripomienka: ${responsibility.title}`,
      emailButtonLabel: "Otvoriť organizáciu",
    });

    res.json({ message: "Pripomienka bola odoslaná", recipientCount: recipientIds.length });
  });

  app.post("/api/organization/:id/inventory", requireManager, (req, res) => {
    try {
      const responsibilityId = Number(req.params.id);
      const responsibility = Number.isInteger(responsibilityId) ? storage.getTeamResponsibility(responsibilityId) : undefined;
      if (!responsibility) return res.status(404).json({ message: "Inventár nebol nájdený" });
      if (responsibility.kind !== "inventory") {
        return res.status(400).json({ message: "Veci možno pridávať iba do inventára" });
      }
      res.status(201).json(storage.createTeamInventoryItem(parseTeamInventoryItem(req.body, responsibilityId)));
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Vec sa nepodarilo pridať" });
    }
  });

  app.put("/api/organization/:id/inventory/order", requireManager, (req, res) => {
    try {
      const responsibilityId = Number(req.params.id);
      if (!Number.isInteger(responsibilityId) || !storage.getTeamResponsibility(responsibilityId)) {
        return res.status(404).json({ message: "Inventár nebol nájdený" });
      }
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
      if (ids.some((id: number) => !Number.isInteger(id))) {
        return res.status(400).json({ message: "Neplatné poradie inventára" });
      }
      storage.reorderTeamInventoryItems(responsibilityId, ids);
      res.json({ message: "Poradie inventára bolo uložené" });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Poradie inventára sa nepodarilo uložiť" });
    }
  });

  app.put("/api/organization/:id/inventory/:itemId", requireManager, (req, res) => {
    try {
      const responsibilityId = Number(req.params.id);
      const itemId = Number(req.params.itemId);
      if (!Number.isInteger(responsibilityId) || !Number.isInteger(itemId)) {
        return res.status(400).json({ message: "Neplatné ID inventárnej položky" });
      }
      const { responsibilityId: _responsibilityId, ...item } = parseTeamInventoryItem(req.body, responsibilityId);
      const updated = storage.updateTeamInventoryItem(responsibilityId, itemId, item);
      if (!updated) return res.status(404).json({ message: "Vec nebola nájdená" });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Vec sa nepodarilo upraviť" });
    }
  });

  app.delete("/api/organization/:id/inventory/:itemId", requireManager, (req, res) => {
    const responsibilityId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(responsibilityId) || !Number.isInteger(itemId)) {
      return res.status(400).json({ message: "Neplatné ID inventárnej položky" });
    }
    if (!storage.deleteTeamInventoryItem(responsibilityId, itemId)) {
      return res.status(404).json({ message: "Vec nebola nájdená" });
    }
    res.json({ message: "Vec bola zmazaná" });
  });
}
