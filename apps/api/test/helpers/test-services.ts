import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { hashSync, compareSync } from 'bcryptjs';
import type { JwtService } from '@nestjs/jwt';
import type { PasswordHasher } from '../../src/application/identity/ports/password-hasher.port';
import type {
  TokenService,
  AccessTokenPayload,
} from '../../src/application/identity/ports/token-service.port';

const TEST_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-characters-long';
const TEST_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-characters-long';

export function createTestPasswordHasher(): PasswordHasher {
  return {
    async hash(plain: string): Promise<string> {
      return hashSync(plain, 4);
    },
    async compare(plain: string, hashed: string): Promise<boolean> {
      return compareSync(plain, hashed);
    },
  };
}

export function createTestTokenService(jwt: JwtService): TokenService {
  return {
    generateAccessToken(payload: AccessTokenPayload): string {
      return jwt.sign(payload, { secret: TEST_ACCESS_SECRET, expiresIn: 900 });
    },
    generateRefreshToken(): string {
      return randomBytes(40).toString('hex');
    },
    verifyAccessToken(token: string): AccessTokenPayload | null {
      try {
        return jwt.verify<AccessTokenPayload>(token, { secret: TEST_ACCESS_SECRET });
      } catch {
        return null;
      }
    },
    hashRefreshToken(token: string): string {
      return createHmac('sha256', TEST_REFRESH_SECRET).update(token).digest('hex');
    },
    compareRefreshToken(token: string, hash: string): boolean {
      const computed = createHmac('sha256', TEST_REFRESH_SECRET).update(token).digest('hex');
      try {
        return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
      } catch {
        return false;
      }
    },
  };
}
