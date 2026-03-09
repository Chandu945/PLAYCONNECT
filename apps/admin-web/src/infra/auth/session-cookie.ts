import 'server-only';

import { cookies } from 'next/headers';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

import { publicEnv, serverEnv } from '@/infra/env';

const COOKIE_NAME = 'pc_admin_session';
const ALGORITHM = 'aes-256-gcm';

type SessionPayload = {
  refreshToken: string;
  deviceId: string;
};

function getDerivedKey(): Buffer {
  const { COOKIE_SECRET } = serverEnv();
  return scryptSync(COOKIE_SECRET, 'playconnect-salt', 32);
}

function encrypt(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv + authTag + ciphertext)
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(encoded: string): string {
  const key = getDerivedKey();
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export async function setSessionCookie(refreshToken: string, deviceId: string): Promise<void> {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_APP_ENV } = publicEnv();

  const payload: SessionPayload = { refreshToken, deviceId };
  const encrypted = encrypt(JSON.stringify(payload));

  cookieStore.set(COOKIE_NAME, encrypted, {
    httpOnly: true,
    sameSite: 'lax',
    secure: NEXT_PUBLIC_APP_ENV !== 'development',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
}

export async function getSessionCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return null;

  try {
    const decrypted = decrypt(cookie.value);
    return JSON.parse(decrypted) as SessionPayload;
  } catch {
    return null;
  }
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
