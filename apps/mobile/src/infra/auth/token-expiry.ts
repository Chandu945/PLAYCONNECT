// atob is available at runtime in React Native but not in the ES2022 lib types
declare function atob(data: string): string;

/**
 * Decode JWT expiry without verifying signature (client-side check only).
 * Returns the expiry timestamp in milliseconds, or null if unparseable.
 */
export function getTokenExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // JWT base64url → base64: replace URL-safe chars and pad
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/** Refresh buffer — refresh when token expires within this window. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns true if the token is expired or will expire within the buffer window.
 */
export function isTokenExpiredOrExpiring(token: string): boolean {
  const expiryMs = getTokenExpiryMs(token);
  if (expiryMs === null) return true; // unparseable → treat as expired
  return Date.now() >= expiryMs - REFRESH_BUFFER_MS;
}
