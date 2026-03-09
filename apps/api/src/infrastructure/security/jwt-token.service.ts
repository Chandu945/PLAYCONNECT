import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type {
  TokenService,
  AccessTokenPayload,
} from '@application/identity/ports/token-service.port';
import { AppConfigService } from '@shared/config/config.service';

/**
 * JWT-based token service.
 * Access tokens are JWTs (short-lived, 15m default).
 * Refresh tokens are opaque random strings, stored hashed (SHA-256 HMAC).
 */
@Injectable()
export class JwtTokenService implements TokenService {
  private readonly refreshSecret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {
    this.refreshSecret = config.jwtRefreshSecret;
  }

  generateAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.jwtAccessSecret,
      expiresIn: this.config.jwtAccessTtl,
      issuer: 'playconnect-api',
      audience: 'playconnect',
    });
  }

  generateRefreshToken(): string {
    return randomBytes(40).toString('hex');
  }

  verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      return this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.jwtAccessSecret,
        issuer: 'playconnect-api',
        audience: 'playconnect',
      });
    } catch {
      return null;
    }
  }

  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.refreshSecret).update(token).digest('hex');
  }

  compareRefreshToken(token: string, hash: string): boolean {
    const computed = this.hashRefreshToken(token);
    try {
      return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
    } catch {
      return false;
    }
  }
}
