import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { apiPost } from '@/infra/http/api-client';
import { getSessionCookie, clearSessionCookie } from '@/infra/auth/session-cookie';
import { isOriginValid } from '@/infra/auth/csrf';

export async function POST(request: NextRequest) {
  if (!isOriginValid(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await getSessionCookie();
  const authHeader = request.headers.get('Authorization');
  const accessToken = authHeader?.replace('Bearer ', '');

  if (session) {
    // Best-effort backend logout
    await apiPost(
      '/api/v1/admin/auth/logout',
      {
        refreshToken: session.refreshToken,
        deviceId: session.deviceId,
      },
      { accessToken: accessToken ?? undefined },
    );
  }

  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}
