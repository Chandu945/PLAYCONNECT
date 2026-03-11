/**
 * Sanitizes a filename for use in Content-Disposition headers.
 * Removes characters that could cause header injection or path traversal.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^\w.\-]/g, '_')  // Only allow word chars, dots, hyphens
    .replace(/\.{2,}/g, '.')    // Collapse consecutive dots
    .slice(0, 200);             // Limit length
}
