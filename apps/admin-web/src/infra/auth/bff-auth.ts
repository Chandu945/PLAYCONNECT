import 'server-only';

import type { NextRequest } from 'next/server';

import { apiPost } from '@/infra/http/api-client';
import {
  getSessionCookie,
  setSessionCookie,
  clearSessionCookie,
} from '@/infra/auth/session-cookie';

type RefreshResult = {
  accessToken: string;
  refreshToken: string;
};

/**
 * Extract access token from the request Authorization header,
 * or attempt a refresh using the session cookie.
 * Returns the access token or null if unauthenticated.
 */
export async function resolveAccessToken(request: NextRequest): Promise<string | null> {
  // Try Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fall back to refreshing via session cookie
  const session = await getSessionCookie();
  if (!session) return null;

  const result = await apiPost<RefreshResult>('/api/v1/admin/auth/refresh', {
    refreshToken: session.refreshToken,
    deviceId: session.deviceId,
    userId: session.userId,
  });

  if (!result.ok) {
    await clearSessionCookie();
    return null;
  }

  // Rotate cookie
  await setSessionCookie(result.data.refreshToken ?? session.refreshToken, session.deviceId, session.userId);
  return result.data.accessToken;
}

/**
 * Clear session cookie on backend 401. Call this when a backend
 * request fails with 401 to prevent infinite loops.
 */
export async function handleBackend401(): Promise<void> {
  await clearSessionCookie();
}
