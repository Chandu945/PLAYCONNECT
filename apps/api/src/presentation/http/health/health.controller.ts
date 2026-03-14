import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { MongoDbHealthIndicator } from '../../../infrastructure/database/mongodb.health';
import { getRequestId } from '../../../shared/logging/request-id.interceptor';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
@SkipThrottle()
@Public()
export class HealthController {
  constructor(private readonly mongoHealth: MongoDbHealthIndicator) {}

  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({
    status: 200,
    description: 'Service is alive',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        service: { type: 'string', example: 'playconnect-api' },
        time: { type: 'string', format: 'date-time' },
        requestId: { type: 'string' },
      },
    },
  })
  liveness(@Req() req: Request) {
    return {
      status: 'ok',
      service: 'playconnect-api',
      time: new Date().toISOString(),
      requestId: getRequestId(req),
    };
  }

  @Get('readiness')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({
    status: 200,
    description: 'Service readiness status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok', 'unavailable'] },
        service: { type: 'string', example: 'playconnect-api' },
        time: { type: 'string', format: 'date-time' },
        dependencies: {
          type: 'object',
          properties: {
            mongodb: { type: 'string', enum: ['up', 'down', 'not_configured'] },
          },
        },
        requestId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Service unavailable — dependency down' })
  async readiness(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const mongoStatus = await this.mongoHealth.check();

    const isDown = mongoStatus === 'down';

    if (isDown) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: isDown ? 'unavailable' : 'ok',
      service: 'playconnect-api',
      time: new Date().toISOString(),
      dependencies: {
        mongodb: mongoStatus,
      },
      requestId: getRequestId(req),
    };
  }
}
