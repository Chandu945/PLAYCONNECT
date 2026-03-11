/**
 * Escapes all regex metacharacters in a string so it can be safely
 * interpolated into a RegExp or MongoDB $regex query.
 *
 * Prevents regex injection / ReDoS when user-supplied strings are used
 * in $regex filters.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
