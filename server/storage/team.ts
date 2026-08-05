import { eq, and, asc } from "drizzle-orm";
import {
  users,
  teamResponsibilities,
  teamResponsibilityOwners,
  teamInventoryItems,
} from '@shared/schema';
import type {
  User,
  TeamResponsibility,
  InsertTeamResponsibility,
  TeamInventoryItem,
  InsertTeamInventoryItem,
} from '@shared/schema';
import { db, sqlite } from "./db";
import type { TeamResponsibilityWithOwners } from "./types";

export class TeamStore {
  // ============ TEAM ORGANIZATION ============
  getTeamResponsibilities(): TeamResponsibilityWithOwners[] {
    return db.select().from(teamResponsibilities)
      .orderBy(asc(teamResponsibilities.sortOrder), asc(teamResponsibilities.id))
      .all()
      .map(responsibility => this.attachTeamResponsibilityOwners(responsibility));
  }

  getTeamResponsibility(id: number): TeamResponsibilityWithOwners | undefined {
    const responsibility = db.select().from(teamResponsibilities)
      .where(eq(teamResponsibilities.id, id))
      .get();
    return responsibility ? this.attachTeamResponsibilityOwners(responsibility) : undefined;
  }

  private attachTeamResponsibilityOwners(responsibility: TeamResponsibility): TeamResponsibilityWithOwners {
    const owners = db.select().from(teamResponsibilityOwners)
      .where(eq(teamResponsibilityOwners.responsibilityId, responsibility.id))
      .all()
      .map(assignment => db.select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, assignment.userId))
      .get())
      .filter((owner): owner is Pick<User, "id" | "name"> => Boolean(owner));
    const inventoryItems = db.select().from(teamInventoryItems)
      .where(eq(teamInventoryItems.responsibilityId, responsibility.id))
      .orderBy(asc(teamInventoryItems.sortOrder), asc(teamInventoryItems.id))
      .all();
    return { ...responsibility, owners, inventoryItems };
  }

  createTeamResponsibility(responsibility: InsertTeamResponsibility, ownerIds: number[]): TeamResponsibilityWithOwners {
    const nextOrder = sqlite.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM team_responsibilities")
      .get() as { value: number };
    const created = db.transaction(tx => {
      const item = tx.insert(teamResponsibilities)
        .values({ ...responsibility, sortOrder: responsibility.sortOrder ?? nextOrder.value })
        .returning()
        .get();
      if (ownerIds.length > 0) {
        tx.insert(teamResponsibilityOwners)
          .values(ownerIds.map(userId => ({ responsibilityId: item.id, userId })))
          .run();
      }
      return item;
    });
    return this.attachTeamResponsibilityOwners(created);
  }

  updateTeamResponsibility(id: number, responsibility: InsertTeamResponsibility, ownerIds: number[]): TeamResponsibilityWithOwners | undefined {
    if (!this.getTeamResponsibility(id)) return undefined;
    db.transaction(tx => {
      tx.update(teamResponsibilities)
        .set({ ...responsibility, updatedAt: new Date().toISOString() })
        .where(eq(teamResponsibilities.id, id))
        .run();
      tx.delete(teamResponsibilityOwners)
        .where(eq(teamResponsibilityOwners.responsibilityId, id))
        .run();
      if (ownerIds.length > 0) {
        tx.insert(teamResponsibilityOwners)
          .values(ownerIds.map(userId => ({ responsibilityId: id, userId })))
          .run();
      }
    });
    return this.getTeamResponsibility(id);
  }

  deleteTeamResponsibility(id: number): boolean {
    return db.transaction(tx => {
      tx.delete(teamInventoryItems)
        .where(eq(teamInventoryItems.responsibilityId, id))
        .run();
      tx.delete(teamResponsibilityOwners)
        .where(eq(teamResponsibilityOwners.responsibilityId, id))
        .run();
      return tx.delete(teamResponsibilities).where(eq(teamResponsibilities.id, id)).run().changes > 0;
    });
  }

  reorderTeamResponsibilities(ids: number[]): void {
    const existingIds = db.select({ id: teamResponsibilities.id }).from(teamResponsibilities).all().map(item => item.id);
    const sortedExisting = [...existingIds].sort((first, second) => first - second);
    const sortedRequested = Array.from(new Set(ids)).sort((first, second) => first - second);
    if (sortedExisting.length !== sortedRequested.length || sortedExisting.some((id, index) => id !== sortedRequested[index])) {
      throw new Error("Neplatné poradie položiek");
    }
    db.transaction(tx => {
      ids.forEach((id, index) => {
        tx.update(teamResponsibilities)
          .set({ sortOrder: index, updatedAt: new Date().toISOString() })
          .where(eq(teamResponsibilities.id, id))
          .run();
      });
    });
  }

  getTeamInventoryItem(responsibilityId: number, itemId: number): TeamInventoryItem | undefined {
    return db.select().from(teamInventoryItems)
      .where(and(eq(teamInventoryItems.id, itemId), eq(teamInventoryItems.responsibilityId, responsibilityId)))
      .get();
  }

  createTeamInventoryItem(item: InsertTeamInventoryItem): TeamInventoryItem {
    const nextOrder = sqlite.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM team_inventory_items WHERE responsibility_id = ?")
      .get(item.responsibilityId) as { value: number };
    return db.insert(teamInventoryItems)
      .values({ ...item, sortOrder: item.sortOrder ?? nextOrder.value })
      .returning()
      .get();
  }

  updateTeamInventoryItem(
    responsibilityId: number,
    itemId: number,
    item: Omit<InsertTeamInventoryItem, "responsibilityId">,
  ): TeamInventoryItem | undefined {
    return db.update(teamInventoryItems)
      .set({ ...item, updatedAt: new Date().toISOString() })
      .where(and(eq(teamInventoryItems.id, itemId), eq(teamInventoryItems.responsibilityId, responsibilityId)))
      .returning()
      .get();
  }

  deleteTeamInventoryItem(responsibilityId: number, itemId: number): boolean {
    return db.delete(teamInventoryItems)
      .where(and(eq(teamInventoryItems.id, itemId), eq(teamInventoryItems.responsibilityId, responsibilityId)))
      .run().changes > 0;
  }

  reorderTeamInventoryItems(responsibilityId: number, ids: number[]): void {
    const existingIds = db.select({ id: teamInventoryItems.id })
      .from(teamInventoryItems)
      .where(eq(teamInventoryItems.responsibilityId, responsibilityId))
      .all()
      .map(item => item.id);
    const sortedExisting = [...existingIds].sort((first, second) => first - second);
    const sortedRequested = Array.from(new Set(ids)).sort((first, second) => first - second);
    if (sortedExisting.length !== sortedRequested.length || sortedExisting.some((id, index) => id !== sortedRequested[index])) {
      throw new Error("Neplatné poradie inventára");
    }
    db.transaction(tx => {
      ids.forEach((id, index) => {
        tx.update(teamInventoryItems)
          .set({ sortOrder: index, updatedAt: new Date().toISOString() })
          .where(and(eq(teamInventoryItems.id, id), eq(teamInventoryItems.responsibilityId, responsibilityId)))
          .run();
      });
    });
  }
}
