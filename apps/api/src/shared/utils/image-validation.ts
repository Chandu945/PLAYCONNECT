/** Allowed image MIME types across all upload endpoints. */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Max upload size in bytes (5 MB). */
export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;

/** MIME → canonical file extension mapping. */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Return the canonical extension for a validated MIME type.
 * Falls back to 'jpg' if the MIME type is unknown (should never happen
 * when called after validateImageBuffer).
 */
export function extensionForMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? 'jpg';
}

// Magic-byte signatures for each allowed format
const SIGNATURES: { mime: string; bytes: number[] }[] = [
  // JPEG: FF D8 FF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  // WebP: RIFF....WEBP  (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

/**
 * Validate that the buffer's magic bytes match the claimed MIME type.
 * Returns `{ valid: true, detectedMime }` or `{ valid: false, reason }`.
 */
export function validateImageBuffer(
  buffer: Buffer,
  claimedMime: string,
): { valid: true; detectedMime: string } | { valid: false; reason: string } {
  if (buffer.length < 12) {
    return { valid: false, reason: 'File too small to be a valid image' };
  }

  // Detect actual format from magic bytes
  let detectedMime: string | null = null;

  for (const sig of SIGNATURES) {
    const match = sig.bytes.every((b, i) => buffer[i] === b);
    if (match) {
      // Extra check for WebP: bytes 8-11 must be "WEBP"
      if (sig.mime === 'image/webp') {
        if (
          buffer[8] === 0x57 && // W
          buffer[9] === 0x45 && // E
          buffer[10] === 0x42 && // B
          buffer[11] === 0x50 // P
        ) {
          detectedMime = sig.mime;
        }
      } else {
        detectedMime = sig.mime;
      }
      break;
    }
  }

  if (!detectedMime) {
    return { valid: false, reason: 'File content does not match any allowed image format' };
  }

  if (detectedMime !== claimedMime) {
    return {
      valid: false,
      reason: `MIME type mismatch: claimed ${claimedMime} but content is ${detectedMime}`,
    };
  }

  return { valid: true, detectedMime };
}
