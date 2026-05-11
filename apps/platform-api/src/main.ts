import { NestFactory } from '@nestjs/core';
import { configurePlatformHttp } from '@work/nest-common';
import { PlatformModule } from './platform.module';

async function bootstrap() {
  const app = await NestFactory.create(PlatformModule);
  configurePlatformHttp(app, { globalPrefix: 'api/platform' });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
