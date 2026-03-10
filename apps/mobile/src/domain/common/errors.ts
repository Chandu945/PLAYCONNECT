export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'NETWORK'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export type AppError = {
  code: AppErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
};

export function unauthorized(message = 'Unauthorized'): AppError {
  return { code: 'UNAUTHORIZED', message };
}

export function validation(message: string, fieldErrors?: Record<string, string>): AppError {
  return { code: 'VALIDATION', message, fieldErrors };
}

export function network(message = 'Network error'): AppError {
  return { code: 'NETWORK', message };
}

export function unknown(message = 'An unexpected error occurred'): AppError {
  return { code: 'UNKNOWN', message };
}
