import { NestFactory } from '@nestjs/core';
import { configurePlatformHttp } from '@work/nest-common';
import { NotificationModule } from './notification.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationModule);
  configurePlatformHttp(app, { globalPrefix: 'api/notifications' });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3004);
}

void bootstrap();
