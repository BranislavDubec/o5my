import { eq, and, asc, desc, isNull } from "drizzle-orm";
import {
  mediaCollections,
  mediaFiles,
} from '@shared/schema';
import type {
  MediaCollection,
  MediaFile,
} from '@shared/schema';
import { db } from "./db";
import type { NewStoredMediaFile, PhotoAlbumWithFiles, TacticWithFiles } from "./types";

export class MediaStore {
  // ============ TEAM MEDIA ============
  getMediaFile(id: number): MediaFile | undefined {
    return db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).get();
  }

  getPhotos(): MediaFile[] {
    return db.select().from(mediaFiles)
      .where(and(eq(mediaFiles.category, "photo"), isNull(mediaFiles.collectionId)))
      .orderBy(desc(mediaFiles.createdAt))
      .all();
  }

  getPhotoAlbums(): PhotoAlbumWithFiles[] {
    return db.select().from(mediaCollections)
      .where(eq(mediaCollections.kind, "album"))
      .orderBy(desc(mediaCollections.createdAt))
      .all()
      .map(collection => this.withPhotos(collection));
  }

  getPhotoAlbum(id: number): PhotoAlbumWithFiles | undefined {
    const collection = db.select().from(mediaCollections)
      .where(and(eq(mediaCollections.id, id), eq(mediaCollections.kind, "album")))
      .get();
    if (!collection) return undefined;
    return this.withPhotos(collection);
  }

  createPhotoAlbum(title: string, createdBy: number): MediaCollection {
    return db.insert(mediaCollections).values({
      kind: "album",
      title,
      description: null,
      createdBy,
    }).returning().get();
  }

  renamePhotoAlbum(id: number, title: string): MediaCollection | undefined {
    const existing = this.getPhotoAlbum(id);
    if (!existing) return undefined;
    db.update(mediaCollections)
      .set({ title })
      .where(and(eq(mediaCollections.id, id), eq(mediaCollections.kind, "album")))
      .run();
    return this.getPhotoAlbum(id);
  }

  deletePhotoAlbum(id: number): void {
    db.transaction(tx => {
      tx.update(mediaFiles)
        .set({ collectionId: null })
        .where(and(eq(mediaFiles.collectionId, id), eq(mediaFiles.category, "photo")))
        .run();
      tx.delete(mediaCollections)
        .where(and(eq(mediaCollections.id, id), eq(mediaCollections.kind, "album")))
        .run();
    });
  }

  createPhotos(files: NewStoredMediaFile[], albumId: number | null = null): MediaFile[] {
    if (files.length === 0) return [];
    return db.insert(mediaFiles).values(files.map((file, index) => ({
      ...file,
      collectionId: albumId,
      category: "photo",
      sortOrder: file.sortOrder ?? index,
    }))).returning().all();
  }

  movePhoto(photoId: number, albumId: number | null): MediaFile | undefined {
    const photo = db.select().from(mediaFiles)
      .where(and(eq(mediaFiles.id, photoId), eq(mediaFiles.category, "photo")))
      .get();
    if (!photo) return undefined;
    db.update(mediaFiles)
      .set({ collectionId: albumId })
      .where(eq(mediaFiles.id, photoId))
      .run();
    return this.getMediaFile(photoId);
  }

  deleteMediaFile(id: number): void {
    db.delete(mediaFiles).where(eq(mediaFiles.id, id)).run();
  }

  private withPhotos(collection: MediaCollection): PhotoAlbumWithFiles {
    return {
      ...collection,
      files: db.select().from(mediaFiles)
        .where(and(eq(mediaFiles.collectionId, collection.id), eq(mediaFiles.category, "photo")))
        .orderBy(asc(mediaFiles.sortOrder), desc(mediaFiles.createdAt))
        .all(),
    };
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
