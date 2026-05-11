import { NestFactory } from '@nestjs/core';
import { configurePlatformHttp } from '@work/nest-common';
import { RealtimeModule } from './realtime.module';

async function bootstrap() {
  const app = await NestFactory.create(RealtimeModule);
  configurePlatformHttp(app, { globalPrefix: 'api/realtime' });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3005);
}

void bootstrap();
