import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from './gateway.module';

describe('forms/files gateway mounting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GatewayModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configurePlatformHttp(app, { globalPrefix: 'api' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('mounts forms and files routes with their module prefixes', async () => {
    await request(app.getHttpServer())
      .get('/api/forms/health')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ module: 'forms', status: 'ok' });
      });

    await request(app.getHttpServer())
      .get('/api/files/health')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ module: 'files', status: 'ok' });
      });
  });
});
