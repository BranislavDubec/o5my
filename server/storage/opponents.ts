import { eq, asc } from "drizzle-orm";
import { opponents } from '@shared/schema';
import type {
  Opponent,
  InsertOpponent,
  UpdateOpponent,
} from '@shared/schema';
import { db } from "./db";

export class OpponentsStore {
  getAllOpponents(): Opponent[]{
    return db.select().from(opponents).orderBy(asc(opponents.name)).all();
  }
  createOpponent(opponent: InsertOpponent): Opponent {
    return db.insert(opponents).values(opponent).returning().get();
}
  updateOpponent(
  id: number,
  data: UpdateOpponent,
): Opponent | undefined {
  return db.update(opponents).set(data).where(eq(opponents.id, id)).returning().get();  
}
  deleteOpponent(id: number): void {
    db.delete(opponents).where(eq(opponents.id, id)).run();
  }
}
