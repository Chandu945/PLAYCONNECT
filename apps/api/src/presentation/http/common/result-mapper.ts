import {
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import type { Result } from '@shared/kernel';
import type { AppError } from '@shared/kernel';
import { getRequestId } from '@shared/logging/request-id.interceptor';
import type { Request } from 'express';

const ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  ACADEMY_SETUP_REQUIRED: HttpStatus.CONFLICT,
  SUBSCRIPTION_BLOCKED: HttpStatus.FORBIDDEN,
  PAYMENT_PROVIDER_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  COOLDOWN_ACTIVE: HttpStatus.TOO_MANY_REQUESTS,
};

function throwMappedError(error: AppError): never {
  const status = ERROR_STATUS_MAP[error.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      throw new BadRequestException(error.message);
    case HttpStatus.UNAUTHORIZED:
      throw new UnauthorizedException(error.message);
    case HttpStatus.FORBIDDEN:
      throw new ForbiddenException(error.message);
    case HttpStatus.NOT_FOUND:
      throw new NotFoundException(error.message);
    case HttpStatus.CONFLICT:
      throw new ConflictException(error.message);
    case HttpStatus.TOO_MANY_REQUESTS:
      throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
    case HttpStatus.SERVICE_UNAVAILABLE:
      throw new ServiceUnavailableException(error.message);
    default:
      throw new InternalServerErrorException(error.message);
  }
}

export function mapResultToResponse<T>(
  result: Result<T, AppError>,
  req: Request,
  _successStatus: HttpStatus = HttpStatus.OK,
): { success: true; data: T; requestId: string; timestamp: string } {
  if (!result.ok) {
    throwMappedError(result.error);
  }

  // If we need to set a non-200 status we can do so via the response object,
  // but NestJS infers from @HttpCode or @Post defaults.
  // For 201 we handle it in the controller with @HttpCode.

  return {
    success: true,
    data: result.value,
    requestId: getRequestId(req),
    timestamp: new Date().toISOString(),
  };
}
