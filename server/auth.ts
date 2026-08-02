import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from './storage';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Middleware: require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ message: 'Prihlásenie vyžadované' });
  }
  const user = storage.getUser(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: 'Používateľ neexistuje' });
  }
  if (!user.isActive) {
    req.session.destroy(() => {});
    return res.status(403).json({ message: 'Účet je deaktivovaný' });
  }
  req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
  next();
}

// Middleware: require admin role
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Vyžadované admin práva' });
    }
    next();
  });
}

// Get current user (safe, without password)
export function getCurrentUser(req: Request) {
  if (!req.session?.userId) return null;
  const user = storage.getUser(req.session.userId);
  if (!user?.isActive) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}
