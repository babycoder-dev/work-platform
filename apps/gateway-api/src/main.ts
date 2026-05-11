import { NestFactory } from '@nestjs/core';
import { configurePlatformHttp } from '@work/nest-common';
import { GatewayModule } from './gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);
  configurePlatformHttp(app, { globalPrefix: 'api' });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

void bootstrap();
