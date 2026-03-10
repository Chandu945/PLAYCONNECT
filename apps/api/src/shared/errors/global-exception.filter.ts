import {
  type ExceptionFilter,
  Catch,
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ErrorEnvelope } from './error.types';
import { getRequestId, REQUEST_ID_HEADER } from '../logging/request-id.interceptor';
import { v4 as uuidv4 } from 'uuid';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'InternalServerError';
    let details: unknown[] = [];

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp['message'] as string) || exception.message;
        error = (resp['error'] as string) || error;
        if (Array.isArray(resp['message'])) {
          details = resp['message'] as unknown[];
          message = 'Validation failed';
        }
      }

      error = this.getErrorName(statusCode);
    }

    // Log unexpected (500) errors server-side for debugging
    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled exception: ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // Never leak stack traces in production
    const isProduction = process.env['APP_ENV'] === 'production';
    if (isProduction && statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      message = 'Internal server error';
      details = [];
    }

    // Ensure requestId exists even for errors that bypass the interceptor
    let requestId = getRequestId(request);
    if (requestId === 'unknown') {
      requestId = uuidv4();
      request.headers[REQUEST_ID_HEADER.toLowerCase()] = requestId;
    }
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const envelope: ErrorEnvelope = {
      statusCode,
      error,
      message,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId,
      details,
    };

    response.status(statusCode).json(envelope);
  }

  private getErrorName(statusCode: number): string {
    const names: Record<number, string> = {
      400: 'BadRequest',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'NotFound',
      409: 'Conflict',
      422: 'UnprocessableEntity',
      429: 'TooManyRequests',
      500: 'InternalServerError',
    };
    return names[statusCode] || 'Error';
  }
}
