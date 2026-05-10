import { NestFactory } from '@nestjs/core';
import { ImAdapterModule } from './im-adapter.module';

async function bootstrap() {
  const app = await NestFactory.create(ImAdapterModule);
  app.setGlobalPrefix('api/im-adapter');
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3003);
}

void bootstrap();
