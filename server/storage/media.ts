import { eq, and, asc, desc } from "drizzle-orm";
import {
  mediaCollections,
  mediaFiles,
} from '@shared/schema';
import type {
  MediaFile,
} from '@shared/schema';
import { db } from "./db";
import type { NewStoredMediaFile, TacticWithFiles } from "./types";

export class MediaStore {
  // ============ TEAM MEDIA ============
  getMediaFile(id: number): MediaFile | undefined {
    return db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).get();
  }

  getPhotos(): MediaFile[] {
    return db.select().from(mediaFiles)
      .where(eq(mediaFiles.category, "photo"))
      .orderBy(desc(mediaFiles.createdAt))
      .all();
  }

  createPhotos(files: NewStoredMediaFile[]): MediaFile[] {
    if (files.length === 0) return [];
    return db.insert(mediaFiles).values(files.map((file, index) => ({
      ...file,
      collectionId: null,
      category: "photo",
      sortOrder: file.sortOrder ?? index,
    }))).returning().all();
  }

  deleteMediaFile(id: number): void {
    db.delete(mediaFiles).where(eq(mediaFiles.id, id)).run();
  }

  getTacticCollections(): TacticWithFiles[] {
    return db.select().from(mediaCollections)
      .where(eq(mediaCollections.kind, "tactic"))
      .orderBy(desc(mediaCollections.createdAt))
      .all()
      .map(collection => ({
        ...collection,
        files: db.select().from(mediaFiles)
          .where(eq(mediaFiles.collectionId, collection.id))
          .orderBy(asc(mediaFiles.sortOrder))
          .all(),
      }));
  }

  getTacticCollection(id: number): TacticWithFiles | undefined {
    const collection = db.select().from(mediaCollections)
      .where(and(eq(mediaCollections.id, id), eq(mediaCollections.kind, "tactic")))
      .get();
    if (!collection) return undefined;

    return {
      ...collection,
      files: db.select().from(mediaFiles)
        .where(eq(mediaFiles.collectionId, collection.id))
        .orderBy(asc(mediaFiles.sortOrder))
        .all(),
    };
  }

  createTacticCollection(
    title: string,
    description: string | null,
    createdBy: number,
    files: NewStoredMediaFile[],
  ): TacticWithFiles {
    return db.transaction(tx => {
      const collection = tx.insert(mediaCollections).values({
        kind: "tactic",
        title,
        description,
        createdBy,
      }).returning().get();

      const createdFiles = tx.insert(mediaFiles).values(files.map((file, index) => ({
        ...file,
        collectionId: collection.id,
        category: "tactic",
        sortOrder: file.sortOrder ?? index,
      }))).returning().all();

      return { ...collection, files: createdFiles };
    });
  }

  updateTacticCollection(
    id: number,
    title: string,
    description: string | null,
    fileOrder: number[],
    newFiles: NewStoredMediaFile[],
  ): TacticWithFiles | undefined {
    const existing = this.getTacticCollection(id);
    if (!existing) return undefined;

    const existingIds = existing.files.map(file => file.id).sort((a, b) => a - b);
    const orderedIds = [...fileOrder].sort((a, b) => a - b);
    if (existingIds.length !== orderedIds.length || existingIds.some((fileId, index) => fileId !== orderedIds[index])) {
      throw new Error("Neplatné poradie súborov");
    }

    db.transaction(tx => {
      tx.update(mediaCollections)
        .set({ title, description })
        .where(eq(mediaCollections.id, id))
        .run();

      fileOrder.forEach((fileId, index) => {
        tx.update(mediaFiles)
          .set({ sortOrder: index })
          .where(and(eq(mediaFiles.id, fileId), eq(mediaFiles.collectionId, id)))
          .run();
      });

      if (newFiles.length > 0) {
        tx.insert(mediaFiles).values(newFiles.map((file, index) => ({
          ...file,
          collectionId: id,
          category: "tactic",
          sortOrder: fileOrder.length + index,
        }))).run();
      }
    });

    return this.getTacticCollection(id);
  }

  deleteTacticFile(collectionId: number, fileId: number): MediaFile | undefined {
    const tactic = this.getTacticCollection(collectionId);
    const file = tactic?.files.find(candidate => candidate.id === fileId);
    if (!tactic || !file) return undefined;

    db.transaction(tx => {
      tx.delete(mediaFiles)
        .where(and(eq(mediaFiles.id, fileId), eq(mediaFiles.collectionId, collectionId)))
        .run();

      tactic.files
        .filter(candidate => candidate.id !== fileId)
        .forEach((candidate, index) => {
          tx.update(mediaFiles)
            .set({ sortOrder: index })
            .where(eq(mediaFiles.id, candidate.id))
            .run();
        });
    });

    return file;
  }

  deleteTacticCollection(id: number): void {
    db.transaction(tx => {
      tx.delete(mediaFiles).where(eq(mediaFiles.collectionId, id)).run();
      tx.delete(mediaCollections).where(eq(mediaCollections.id, id)).run();
    });
  }
}
