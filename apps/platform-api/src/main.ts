import { NestFactory } from '@nestjs/core';
import { PlatformModule } from './platform.module';

async function bootstrap() {
  const app = await NestFactory.create(PlatformModule);
  app.setGlobalPrefix('api/platform');
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
