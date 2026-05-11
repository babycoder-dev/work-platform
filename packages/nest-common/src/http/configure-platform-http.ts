import type { INestApplication } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';
import { traceIdMiddleware } from './trace-id';

export interface PlatformHttpOptions {
  globalPrefix?: string;
}

export function configurePlatformHttp(app: INestApplication, options: PlatformHttpOptions = {}) {
  if (options.globalPrefix) {
    app.setGlobalPrefix(options.globalPrefix);
  }

  app.use(traceIdMiddleware);
  app.useGlobalFilters(new ApiExceptionFilter());
}
