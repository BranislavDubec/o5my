import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from './storage';
import { canManageTeam, canViewPersonalPayments } from '@shared/roles';

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
  if (req.session.passwordVersion !== user.passwordVersion) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: 'Relácia už nie je platná. Prihlás sa znova.' });
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

// Managers can administer all non-financial team features.
export function requireManager(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!canManageTeam(req.user?.role)) {
      return res.status(403).json({ message: 'Vyžadované manažérske práva' });
    }
    next();
  });
}

// Managers must not access either team finances or their personal payment view.
export function requirePaymentAccess(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!canViewPersonalPayments(req.user?.role)) {
      return res.status(403).json({ message: 'Manažér nemá prístup k platbám' });
    }
    next();
  });
}

// Get current user (safe, without password)
export function getCurrentUser(req: Request) {
  if (!req.session?.userId) return null;
  const user = storage.getUser(req.session.userId);
  if (!user?.isActive || req.session.passwordVersion !== user.passwordVersion) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}
