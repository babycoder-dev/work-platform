import { type INestApplication, ValidationPipe } from '@nestjs/common';
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
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
}
