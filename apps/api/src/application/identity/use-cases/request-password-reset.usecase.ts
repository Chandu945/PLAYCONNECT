import { randomUUID } from 'crypto';
import type { Result } from '@shared/kernel';
import { ok } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import type { UserRepository } from '@domain/identity/ports/user.repository';
import type { PasswordResetChallengeRepository } from '@domain/identity/ports/password-reset-challenge.repository';
import type { OtpGenerator } from '../ports/otp-generator.port';
import type { OtpHasher } from '../ports/otp-hasher.port';
import type { EmailSenderPort } from '../../notifications/ports/email-sender.port';
import { PasswordResetChallenge } from '@domain/identity/entities/password-reset-challenge.entity';

interface RequestPasswordResetInput {
  email: string;
}

export interface RequestPasswordResetOutput {
  message: string;
}

const GENERIC_MESSAGE = 'If an account exists, a reset code has been sent.';

export class RequestPasswordResetUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly challengeRepo: PasswordResetChallengeRepository,
    private readonly otpGenerator: OtpGenerator,
    private readonly otpHasher: OtpHasher,
    private readonly emailSender: EmailSenderPort,
    private readonly otpExpiryMinutes: number = 10,
    private readonly otpMaxAttempts: number = 5,
    private readonly otpCooldownSeconds: number = 60,
  ) {}

  async execute(
    input: RequestPasswordResetInput,
  ): Promise<Result<RequestPasswordResetOutput, AppError>> {
    const email = input.email.toLowerCase().trim();
    const user = await this.userRepo.findByEmail(email);

    if (!user) {
      return ok({ message: GENERIC_MESSAGE });
    }

    const userId = user.id.toString();
    const existing = await this.challengeRepo.findLatestActiveByUserId(userId);

    if (existing) {
      const cooldownEnd = new Date(
        existing.createdAt.getTime() + this.otpCooldownSeconds * 1000,
      );
      if (new Date() < cooldownEnd) {
        return ok({ message: GENERIC_MESSAGE });
      }
    }

    await this.challengeRepo.invalidateActiveByUserId(userId);

    const otp = this.otpGenerator.generate();
    const otpHash = await this.otpHasher.hash(otp);

    const challenge = PasswordResetChallenge.create({
      id: randomUUID(),
      userId,
      otpHash,
      expiresAt: new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000),
      maxAttempts: this.otpMaxAttempts,
    });

    await this.challengeRepo.save(challenge);

    await this.emailSender.send({
      to: email,
      subject: 'PlayConnect Password Reset',
      html: `<p>Your PlayConnect password reset code is: <strong>${otp}</strong>. Valid for ${this.otpExpiryMinutes} minutes.</p>`,
    });

    return ok({ message: GENERIC_MESSAGE });
  }
}
