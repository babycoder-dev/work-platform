import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlatformModule } from './platform.module';

describe('platform-api', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PlatformModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configurePlatformHttp(app, { globalPrefix: 'api/platform' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in and returns current user permissions', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: 'admin123',
      })
      .expect(201);

    expect(response.body.accessToken).toContain('dev-access-');
    expect(response.body.user.name).toBe('系统管理员');
    expect(response.body.user.permissions.length).toBeGreaterThan(0);
  });

  it('lists departments', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HQ',
          name: '总部',
        }),
      ]),
    );
  });

  it('returns normalized errors with trace id', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .set('X-Trace-Id', 'trace-e2e')
      .send({
        account: 'admin',
        password: 'wrong-password',
      })
      .expect(401);

    expect(response.headers['x-trace-id']).toBe('trace-e2e');
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_401',
        message: '账号或密码错误',
        traceId: 'trace-e2e',
      }),
    );
  });
});
