import { NestFactory } from '@nestjs/core';
import { configurePlatformHttp } from '@work/nest-common';
import { ImAdapterModule } from './im-adapter.module';

async function bootstrap() {
  const app = await NestFactory.create(ImAdapterModule);
  configurePlatformHttp(app, { globalPrefix: 'api/im-adapter' });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3003);
}

void bootstrap();
