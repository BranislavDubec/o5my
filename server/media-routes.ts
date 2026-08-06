import type { Express, NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { requireAdmin, requireAuth } from "./auth";
import { storage } from "./storage";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 20;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

export const mediaUploadDirectory = path.resolve(
  process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"),
);
fs.mkdirSync(mediaUploadDirectory, { recursive: true });

function storedFilePath(storedName: string): string {
  if (path.basename(storedName) !== storedName) {
    throw new Error("Neplatný názov uloženého súboru");
  }
  return path.join(mediaUploadDirectory, storedName);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: mediaUploadDirectory,
    filename: (_req, file, callback) => {
      callback(null, `${crypto.randomUUID()}${MIME_EXTENSIONS[file.mimetype] || ""}`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
    files: MAX_FILES_PER_UPLOAD,
  },
  fileFilter: (_req, file, callback) => {
    if (!MIME_EXTENSIONS[file.mimetype]) {
      callback(new Error("Podporované sú iba obrázky JPG, PNG, WebP, GIF a PDF"));
      return;
    }
    callback(null, true);
  },
});

function getUploadedFiles(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

function removeStoredFiles(storedNames: string[]) {
  for (const storedName of storedNames) {
    try {
      fs.rmSync(storedFilePath(storedName), { force: true });
    } catch (error) {
      console.error("Failed to remove media file", storedName, error);
    }
  }
}

function hasValidMediaSignature(file: Express.Multer.File): boolean {
  const descriptor = fs.openSync(file.path, "r");
  try {
    const header = Buffer.alloc(12);
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    if (bytesRead < 6) return false;

    if (file.mimetype === "image/jpeg") {
      return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }
    if (file.mimetype === "image/png") {
      return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (file.mimetype === "image/webp") {
      return header.subarray(0, 4).toString("ascii") === "RIFF"
        && header.subarray(8, 12).toString("ascii") === "WEBP";
    }
    if (file.mimetype === "image/gif") {
      const signature = header.subarray(0, 6).toString("ascii");
      return signature === "GIF87a" || signature === "GIF89a";
    }
    if (file.mimetype === "application/pdf") {
      return header.subarray(0, 5).toString("ascii") === "%PDF-";
    }
    return false;
  } finally {
    fs.closeSync(descriptor);
  }
}

function mediaUpload(req: Request, res: Response, next: NextFunction) {
  upload.array("images", MAX_FILES_PER_UPLOAD)(req, res, error => {
    const files = getUploadedFiles(req);
    if (error) {
      removeStoredFiles(files.map(file => file.filename));
      const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
        ? "Jeden súbor môže mať najviac 20 MB"
        : error.message || "Nahrávanie zlyhalo";
      return res.status(400).json({ message });
    }

    if (files.some(file => !hasValidMediaSignature(file))) {
      removeStoredFiles(files.map(file => file.filename));
      return res.status(400).json({ message: "Jeden zo súborov nemá platný formát" });
    }
    next();
  });
}

function serializeFile<T extends { id: number }>(file: T) {
  return { ...file, url: `/api/media/files/${file.id}/content` };
}

function serializeTactic(tactic: ReturnType<typeof storage.getTacticCollections>[number]) {
  return { ...tactic, files: tactic.files.map(serializeFile) };
}

function serializeAlbum(album: ReturnType<typeof storage.getPhotoAlbums>[number]) {
  return { ...album, files: album.files.map(serializeFile) };
}

function resolveAlbumId(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Neplatné ID priečinka");
  return id;
}

export function registerMediaRoutes(app: Express) {
  app.get("/api/media/files/:id/content", requireAuth, (req, res, next) => {
    const file = storage.getMediaFile(Number(req.params.id));
    if (!file) return res.status(404).json({ message: "Obrázok nebol nájdený" });

    const filePath = storedFilePath(file.storedName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Súbor na disku nebol nájdený" });
    }

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(filePath, error => {
      if (error) next(error);
    });
  });

  app.get("/api/media/photos", requireAuth, (_req, res) => {
    res.json(storage.getPhotos().map(serializeFile));
  });

  app.post("/api/media/photos", requireAdmin, mediaUpload, (req, res) => {
    const files = getUploadedFiles(req);
    if (files.length === 0) {
      return res.status(400).json({ message: "Vyber aspoň jeden obrázok" });
    }
    if (files.some(file => !file.mimetype.startsWith("image/") || file.size > MAX_IMAGE_SIZE)) {
      removeStoredFiles(files.map(file => file.filename));
      return res.status(400).json({ message: "Fotky musia byť obrázky a môžu mať najviac 10 MB" });
    }

    let albumId: number | null = null;
    try {
      albumId = resolveAlbumId(req.body?.albumId);
    } catch (error) {
      removeStoredFiles(files.map(file => file.filename));
      return res.status(400).json({ message: error instanceof Error ? error.message : "Neplatné ID priečinka" });
    }
    if (albumId !== null && !storage.getPhotoAlbum(albumId)) {
      removeStoredFiles(files.map(file => file.filename));
      return res.status(400).json({ message: "Priečinok nebol nájdený" });
    }

    try {
      const created = storage.createPhotos(files.map((file, index) => ({
        storedName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: req.user!.id,
        sortOrder: index,
      })), albumId);
      res.status(201).json(created.map(serializeFile));
    } catch (error) {
      removeStoredFiles(files.map(file => file.filename));
      throw error;
    }
  });

  app.patch("/api/media/photos/:id", requireAdmin, (req, res) => {
    const photo = storage.getMediaFile(Number(req.params.id));
    if (!photo || photo.category !== "photo") {
      return res.status(404).json({ message: "Fotka nebola nájdená" });
    }

    let albumId: number | null;
    try {
      albumId = resolveAlbumId(req.body?.albumId);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Neplatné ID priečinka" });
    }
    if (albumId !== null && !storage.getPhotoAlbum(albumId)) {
      return res.status(400).json({ message: "Priečinok nebol nájdený" });
    }

    const moved = storage.movePhoto(photo.id, albumId);
    res.json(serializeFile(moved!));
  });

  app.delete("/api/media/photos/:id", requireAdmin, (req, res) => {
    const file = storage.getMediaFile(Number(req.params.id));
    if (!file || file.category !== "photo") {
      return res.status(404).json({ message: "Fotka nebola nájdená" });
    }
    storage.deleteMediaFile(file.id);
    removeStoredFiles([file.storedName]);
    res.json({ message: "Fotka bola zmazaná" });
  });

  app.get("/api/media/albums", requireAuth, (_req, res) => {
    res.json(storage.getPhotoAlbums().map(serializeAlbum));
  });

  app.post("/api/media/albums", requireAdmin, (req, res) => {
    const title = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!title || title.length > 100) {
      return res.status(400).json({ message: "Názov priečinka je povinný a môže mať najviac 100 znakov" });
    }
    res.status(201).json(storage.createPhotoAlbum(title, req.user!.id));
  });

  app.patch("/api/media/albums/:id", requireAdmin, (req, res) => {
    const title = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!title || title.length > 100) {
      return res.status(400).json({ message: "Názov priečinka je povinný a môže mať najviac 100 znakov" });
    }
    const updated = storage.renamePhotoAlbum(Number(req.params.id), title);
    if (!updated) return res.status(404).json({ message: "Priečinok nebol nájdený" });
    res.json(updated);
  });

  app.delete("/api/media/albums/:id", requireAdmin, (req, res) => {
    const album = storage.getPhotoAlbum(Number(req.params.id));
    if (!album) return res.status(404).json({ message: "Priečinok nebol nájdený" });
    storage.deletePhotoAlbum(album.id);
    res.json({ message: "Priečinok bol zmazaný" });
  });

  app.get("/api/media/tactics", requireAuth, (_req, res) => {
    res.json(storage.getTacticCollections().map(serializeTactic));
  });

  app.get("/api/media/tactics/:id", requireAuth, (req, res) => {
    const tactic = storage.getTacticCollection(Number(req.params.id));
    if (!tactic) return res.status(404).json({ message: "Taktika nebola nájdená" });
    res.json(serializeTactic(tactic));
  });

  app.post("/api/media/tactics", requireAdmin, mediaUpload, (req, res) => {
    const files = getUploadedFiles(req);
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    if (!title || title.length > 100) {
      removeStoredFiles(files.map(file => file.filename));
      return res.status(400).json({ message: "Názov taktiky je povinný a môže mať najviac 100 znakov" });
    }
    if (description.length > 1000) {
      removeStoredFiles(files.map(file => file.filename));
      return res.status(400).json({ message: "Popis môže mať najviac 1000 znakov" });
    }
    if (files.length === 0) {
      return res.status(400).json({ message: "Taktika musí obsahovať aspoň jeden obrázok alebo PDF" });
    }

    try {
      const tactic = storage.createTacticCollection(
        title,
        description || null,
        req.user!.id,
        files.map((file, index) => ({
          storedName: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          uploadedBy: req.user!.id,
          sortOrder: index,
        })),
      );
      res.status(201).json(serializeTactic(tactic));
    } catch (error) {
      removeStoredFiles(files.map(file => file.filename));
      throw error;
    }
  });

  app.put("/api/media/tactics/:id", requireAdmin, mediaUpload, (req, res) => {
    const files = getUploadedFiles(req);
    const tacticId = Number(req.params.id);
    const existing = storage.getTacticCollection(tacticId);
    if (!existing) {
      removeStoredFiles(files.map(file => file.filename));
      return res.status(404).json({ message: "Taktika nebola nájdená" });
    }

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    if (!title || title.length > 100) {
      removeStoredFiles(files.map(file => file.filename));
      return res.status(400).json({ message: "Názov taktiky je povinný a môže mať najviac 100 znakov" });
    }
    if (description.length > 1000) {
      removeStoredFiles(files.map(file => file.filename));
      return res.status(400).json({ message: "Popis môže mať najviac 1000 znakov" });
    }

    let fileOrder: number[];
    try {
      const parsed = JSON.parse(typeof req.body?.fileOrder === "string" ? req.body.fileOrder : "[]");
      if (!Array.isArray(parsed) || parsed.some(fileId => !Number.isInteger(fileId))) {
        throw new Error();
      }
      fileOrder = parsed;
    } catch {
      removeStoredFiles(files.map(file => file.filename));
      return res.status(400).json({ message: "Neplatné poradie súborov" });
    }

    try {
      const updated = storage.updateTacticCollection(
        tacticId,
        title,
        description || null,
        fileOrder,
        files.map(file => ({
          storedName: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          uploadedBy: req.user!.id,
        })),
      );
      res.json(serializeTactic(updated!));
    } catch (error) {
      removeStoredFiles(files.map(file => file.filename));
      const message = error instanceof Error ? error.message : "Úprava taktiky zlyhala";
      res.status(400).json({ message });
    }
  });

  app.delete("/api/media/tactics/:id/files/:fileId", requireAdmin, (req, res) => {
    try {
      const tacticId = Number(req.params.id);
      const fileId = Number(req.params.fileId);
      const removed = storage.deleteTacticFile(tacticId, fileId);
      if (!removed) return res.status(404).json({ message: "Súbor nebol nájdený" });

      removeStoredFiles([removed.storedName]);
      const updated = storage.getTacticCollection(tacticId);
      res.json(serializeTactic(updated!));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mazanie súboru zlyhalo";
      res.status(400).json({ message });
    }
  });

  app.delete("/api/media/tactics/:id", requireAdmin, (req, res) => {
    const tactic = storage.getTacticCollection(Number(req.params.id));
    if (!tactic) return res.status(404).json({ message: "Taktika nebola nájdená" });

    storage.deleteTacticCollection(tactic.id);
    removeStoredFiles(tactic.files.map(file => file.storedName));
    res.json({ message: "Taktika bola zmazaná" });
  });
}
