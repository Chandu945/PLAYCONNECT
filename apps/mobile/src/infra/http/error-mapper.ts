import type { AppError, AppErrorCode } from '../../domain/common/errors';

const STATUS_MAP: Record<number, AppErrorCode> = {
  400: 'VALIDATION',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

/**
 * Safe fallback messages for each error code.
 * Used when server message is missing or when we shouldn't expose it.
 */
const SAFE_MESSAGES: Record<AppErrorCode, string> = {
  VALIDATION: 'Please check your input and try again.',
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
  FORBIDDEN: 'You do not have permission for this action.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'This action conflicts with the current state.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  NETWORK: 'Unable to connect. Please check your internet.',
  UNKNOWN: 'Something went wrong. Please try again later.',
};

/** Codes where we trust the server-provided message for display. */
const PASSTHROUGH_CODES = new Set<AppErrorCode>([
  'VALIDATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
]);

const MAX_MESSAGE_LENGTH = 200;

export function mapHttpError(status: number, body: unknown): AppError {
  const code: AppErrorCode = STATUS_MAP[status] ?? 'UNKNOWN';

  let serverMessage: string | undefined;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b['message'] === 'string') {
      serverMessage = b['message'];
    } else if (typeof b['error'] === 'string') {
      serverMessage = b['error'];
    }
  }

  // For known client errors, use the server message if available.
  // For unknown/server errors, always use the safe fallback to prevent leaking internals.
  let message: string;
  if (PASSTHROUGH_CODES.has(code) && serverMessage) {
    message = serverMessage.slice(0, MAX_MESSAGE_LENGTH);
  } else {
    message = SAFE_MESSAGES[code];
  }

  return { code, message };
}
