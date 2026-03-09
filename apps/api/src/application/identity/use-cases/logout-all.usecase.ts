import type { Result } from '@shared/kernel';
import { ok } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { SessionRepository } from '@domain/identity/ports/session.repository';

export interface LogoutAllInput {
  userId: string;
}

export class LogoutAllUseCase {
  constructor(private readonly sessionRepo: SessionRepository) {}

  async execute(input: LogoutAllInput): Promise<Result<void, AppError>> {
    await this.sessionRepo.revokeAllByUserIds([input.userId]);
    return ok(undefined);
  }
}
