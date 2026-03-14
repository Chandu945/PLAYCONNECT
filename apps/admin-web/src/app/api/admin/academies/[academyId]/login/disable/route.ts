import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { apiPut } from '@/infra/http/api-client';
import { resolveAccessToken, handleBackend401 } from '@/infra/auth/bff-auth';
import { isOriginValid } from '@/infra/auth/csrf';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ academyId: string }> },
) {
  if (!isOriginValid(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { academyId } = await context.params;

  const accessToken = await resolveAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const result = await apiPut(
    `/api/v1/admin/academies/${encodeURIComponent(academyId)}/login-disabled`,
    body,
    { accessToken },
  );

  if (!result.ok) {
    if (result.error.code === 'UNAUTHORIZED') {
      await handleBackend401();
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (result.error.code === 'NOT_FOUND') {
      return NextResponse.json({ error: result.error.message }, { status: 404 });
    }
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
