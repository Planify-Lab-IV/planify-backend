import { randomInt } from "node:crypto";
import type { PasswordResetNotifier } from "../infrastructure/notifications/password-reset.notifier.js";
import type { PasswordHasher } from "../infrastructure/security/password.hasher.js";
import type { PasswordResetCodeRepository } from "../repositories/password-reset-code.repository.js";
import type { UserRepository } from "../repositories/user.repository.js";
import { InvalidResetCodeError } from "../shared/errors/index.js";

const MAX_REQUESTS_PER_HOUR = 3;
const MAX_ATTEMPTS = 5;
const CODE_TTL_MS = 30 * 60 * 1000;
const REQUEST_WINDOW_MS = 60 * 60 * 1000;

export interface PasswordResetService {
  requestReset(email: string): Promise<void>;
  resetPassword(email: string, code: string, newPassword: string): Promise<void>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createPasswordResetService(
  userRepository: UserRepository,
  passwordResetCodeRepository: PasswordResetCodeRepository,
  passwordHasher: PasswordHasher,
  notifier: PasswordResetNotifier,
  clock: () => Date,
): PasswordResetService {
  return {
    async requestReset(email): Promise<void> {
      const normalizedEmail = normalizeEmail(email);
      const user = await userRepository.findByEmail(normalizedEmail);
      if (!user) return;

      const now = clock();
      const requestCount = await passwordResetCodeRepository.countCreatedSince(
        user.id,
        new Date(now.getTime() - REQUEST_WINDOW_MS),
      );
      if (requestCount >= MAX_REQUESTS_PER_HOUR) return;

      await passwordResetCodeRepository.invalidateActiveForUser(user.id, now);

      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const codeHash = await passwordHasher.hash(code);
      await passwordResetCodeRepository.create({
        userId: user.id,
        codeHash,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      });
      await notifier.sendResetCode({ email: normalizedEmail, code });
    },

    async resetPassword(email, code, newPassword): Promise<void> {
      const normalizedEmail = normalizeEmail(email);
      const user = await userRepository.findByEmail(normalizedEmail);
      if (!user) throw new InvalidResetCodeError();

      const now = clock();
      const reservedCode = await passwordResetCodeRepository.reserveAttempt(user.id, now, MAX_ATTEMPTS);
      if (!reservedCode) throw new InvalidResetCodeError();

      const isCodeValid = await passwordHasher.compare(code, reservedCode.codeHash);
      if (!isCodeValid) throw new InvalidResetCodeError();

      const wasMarkedUsed = await passwordResetCodeRepository.markUsed(reservedCode.id, now);
      if (!wasMarkedUsed) throw new InvalidResetCodeError();

      const passwordHash = await passwordHasher.hash(newPassword);
      await userRepository.updatePassword(user.id, passwordHash, now);
    },
  };
}
