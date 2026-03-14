import type { JwtService } from '@nestjs/jwt';

const TEST_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-characters-long';

export interface TokenOptions {
  sub?: string;
  role?: 'OWNER' | 'STAFF' | 'SUPER_ADMIN';
  email?: string;
  tokenVersion?: number;
}

/** Generate a signed JWT access token for tests. */
export function makeToken(jwtService: JwtService, opts: TokenOptions = {}): string {
  const { sub = 'owner-1', role = 'OWNER', email, tokenVersion = 0 } = opts;
  return jwtService.sign(
    { sub, role, email: email ?? `${sub}@test.com`, tokenVersion },
    { secret: TEST_ACCESS_SECRET, expiresIn: 900 },
  );
}

/** Convenience: make an owner token. */
export function makeOwnerToken(jwtService: JwtService, sub = 'owner-1'): string {
  return makeToken(jwtService, { sub, role: 'OWNER' });
}

/** Convenience: make a staff token. */
export function makeStaffToken(jwtService: JwtService, sub = 'staff-1'): string {
  return makeToken(jwtService, { sub, role: 'STAFF' });
}

/** Convenience: make a super-admin token. */
export function makeAdminToken(jwtService: JwtService, sub = 'admin-1'): string {
  return makeToken(jwtService, { sub, role: 'SUPER_ADMIN' });
}
