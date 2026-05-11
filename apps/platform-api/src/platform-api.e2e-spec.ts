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

  it('rejects protected endpoints without access token', async () => {
    const response = await request(app.getHttpServer()).get('/api/platform/departments').expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_401',
        message: '未登录',
      }),
    );
  });

  it('lists departments with access token', async () => {
    const token = await loginAsAdmin();
    const response = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .set('Authorization', `Bearer ${token}`)
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

  it('rejects users without required permissions', async () => {
    const adminToken = await loginAsAdmin();
    await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: 'ent-default',
        employeeNo: '000099',
        account: 'limited-user',
        name: '受限用户',
        initialPassword: 'Passw0rd',
      })
      .expect(201);

    const limitedLogin = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'limited-user',
        password: 'Passw0rd',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .set('Authorization', `Bearer ${limitedLogin.body.accessToken}`)
      .expect(403);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_403',
        message: '权限不足',
      }),
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

  async function loginAsAdmin(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: 'admin123',
      })
      .expect(201);

    return response.body.accessToken as string;
  }
});
