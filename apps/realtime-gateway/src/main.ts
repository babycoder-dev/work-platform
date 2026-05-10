import { NestFactory } from '@nestjs/core';
import { RealtimeModule } from './realtime.module';

async function bootstrap() {
  const app = await NestFactory.create(RealtimeModule);
  app.setGlobalPrefix('api/realtime');
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3005);
}

void bootstrap();
