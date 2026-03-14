import { Controller, Get, Inject, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import type { MetricsPort } from '@application/common/ports/metrics.port';
import { METRICS_PORT } from '@application/common/ports/metrics.port';
import { AppConfigService } from '@shared/config/config.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Metrics')
@Controller('metrics')
@SkipThrottle()
@Public()
export class MetricsController {
  constructor(
    @Inject(METRICS_PORT) private readonly metrics: MetricsPort,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Prometheus-compatible metrics endpoint' })
  @HttpCode(HttpStatus.OK)
  getMetrics(@Req() req: Request, @Res() res: Response): void {
    if (!this.config.metricsEnabled) {
      res.status(HttpStatus.NOT_FOUND).json({ message: 'Metrics not enabled' });
      return;
    }

    const metricsToken = this.config.metricsToken;
    if (!metricsToken) {
      res.status(HttpStatus.FORBIDDEN).json({ message: 'Metrics token not configured' });
      return;
    }

    const provided = req.headers['x-metrics-token'] as string | undefined;
    if (!provided || !this.safeCompare(provided, metricsToken)) {
      res.status(HttpStatus.FORBIDDEN).json({ message: 'Invalid metrics token' });
      return;
    }

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(this.metrics.render());
  }

  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Compare against self to keep constant time, then return false
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
