import { eq } from "drizzle-orm";
import {
  emailVerificationTokens,
  passwordResetTokens,
} from '@shared/schema';
import type {
  EmailVerificationToken,
  PasswordResetToken,
} from '@shared/schema';
import { db } from "./db";

export class AuthTokensStore {
  // ============ EMAIL VERIFICATION ============
  createEmailVerificationToken(userId: number, tokenHash: string, expiresAt: string): EmailVerificationToken {
    this.deleteEmailVerificationTokens(userId);
    return db.insert(emailVerificationTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning()
      .get();
  }

  getEmailVerificationToken(tokenHash: string): EmailVerificationToken | undefined {
    return db.select().from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .get();
  }

  deleteEmailVerificationTokens(userId: number): void {
    db.delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))
      .run();
  }

  // ============ PASSWORD RESET ============
  createPasswordResetToken(userId: number, tokenHash: string, expiresAt: string): PasswordResetToken {
    this.deletePasswordResetTokens(userId);
    return db.insert(passwordResetTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning()
      .get();
  }

  getPasswordResetToken(tokenHash: string): PasswordResetToken | undefined {
    return db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .get();
  }

  deletePasswordResetTokens(userId: number): void {
    db.delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .run();
  }
}
