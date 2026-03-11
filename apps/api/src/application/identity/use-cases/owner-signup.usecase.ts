import type { Result } from '@shared/kernel';
import { ok, err } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { User } from '@domain/identity/entities/user.entity';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import { Session } from '@domain/identity/entities/session.entity';
import type { SessionRepository } from '@domain/identity/ports/session.repository';
import type { PasswordHasher } from '../ports/password-hasher.port';
import type { TokenService } from '../ports/token-service.port';
import { AuthErrors } from '../../common/errors';
import { randomUUID } from 'crypto';

export interface OwnerSignupInput {
  fullName: string;
  phoneNumber: string;
  email: string;
  password: string;
  deviceId?: string;
}

export interface OwnerSignupOutput {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    role: string;
    status: string;
  };
}

export class OwnerSignupUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    private readonly refreshTtlSeconds: number = 2_592_000,
  ) {}

  async execute(input: OwnerSignupInput): Promise<Result<OwnerSignupOutput, AppError>> {
    const existingByEmail = await this.userRepo.findByEmail(input.email.trim().toLowerCase());
    if (existingByEmail) {
      return err(AuthErrors.duplicateEmail());
    }

    const existingByPhone = await this.userRepo.findByPhone(input.phoneNumber.trim());
    if (existingByPhone) {
      return err(AuthErrors.duplicatePhone());
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const userId = randomUUID();

    const user = User.create({
      id: userId,
      fullName: input.fullName,
      email: input.email,
      phoneNumber: input.phoneNumber,
      role: 'OWNER',
      passwordHash,
    });

    await this.userRepo.save(user);

    const deviceId = input.deviceId || randomUUID();
    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken);

    const refreshTtlMs = this.refreshTtlSeconds * 1000;
    const session = Session.create({
      id: randomUUID(),
      userId,
      deviceId,
      refreshTokenHash,
      expiresAt: new Date(Date.now() + refreshTtlMs),
    });

    await this.sessionRepo.save(session);

    const accessToken = this.tokenService.generateAccessToken({
      sub: userId,
      role: user.role,
      email: user.emailNormalized,
      tokenVersion: user.tokenVersion,
    });

    return ok({
      accessToken,
      refreshToken,
      deviceId,
      user: {
        id: user.id.toString(),
        fullName: user.fullName,
        email: user.emailNormalized,
        phoneNumber: user.phoneE164,
        role: user.role,
        status: user.status,
      },
    });
  }
}
