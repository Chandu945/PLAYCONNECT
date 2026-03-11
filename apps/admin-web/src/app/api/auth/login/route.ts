import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { apiPost } from '@/infra/http/api-client';
import { setSessionCookie } from '@/infra/auth/session-cookie';

type BackendLoginResponse = {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: 'SUPER_ADMIN';
  };
};

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const result = await apiPost<BackendLoginResponse>('/api/v1/admin/auth/login', {
    email: body.email,
    password: body.password,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.code === 'UNAUTHORIZED' ? 401 : 400 },
    );
  }

  const { accessToken, refreshToken, deviceId, user } = result.data;

  await setSessionCookie(refreshToken, deviceId, user.id);

  return NextResponse.json({ accessToken, user, deviceId });
}
