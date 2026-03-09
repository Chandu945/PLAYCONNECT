import type { PasswordResetChallenge } from '../entities/password-reset-challenge.entity';

export const PASSWORD_RESET_CHALLENGE_REPOSITORY = Symbol('PASSWORD_RESET_CHALLENGE_REPOSITORY');

export interface PasswordResetChallengeRepository {
  save(challenge: PasswordResetChallenge): Promise<void>;
  findLatestActiveByUserId(userId: string): Promise<PasswordResetChallenge | null>;
  invalidateActiveByUserId(userId: string): Promise<void>;
  markUsed(challengeId: string): Promise<void>;
  incrementAttempts(challengeId: string): Promise<void>;
}
