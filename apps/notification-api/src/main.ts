import { NestFactory } from '@nestjs/core';
import { NotificationModule } from './notification.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationModule);
  app.setGlobalPrefix('api/notifications');
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3004);
}

void bootstrap();
