import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { apiPost } from '@/infra/http/api-client';
import {
  getSessionCookie,
  setSessionCookie,
  clearSessionCookie,
} from '@/infra/auth/session-cookie';
import { isOriginValid } from '@/infra/auth/csrf';

type BackendRefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

export async function POST(request: NextRequest) {
  if (!isOriginValid(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await getSessionCookie();
  if (!session) {
    return NextResponse.json({ error: 'No session' }, { status: 401 });
  }

  const result = await apiPost<BackendRefreshResponse>('/api/v1/admin/auth/refresh', {
    refreshToken: session.refreshToken,
    deviceId: session.deviceId,
  });

  if (!result.ok) {
    await clearSessionCookie();
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  // Rotate cookie with new refresh token
  await setSessionCookie(result.data.refreshToken, session.deviceId);

  return NextResponse.json({ accessToken: result.data.accessToken });
}
