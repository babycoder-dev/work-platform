import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlatformModule } from './platform.module';

describe('platform-api', () => {
  let app: INestApplication;
  let previousRepositoryDriver: string | undefined;

  beforeAll(async () => {
    previousRepositoryDriver = process.env.PLATFORM_REPOSITORY_DRIVER;
    process.env.PLATFORM_REPOSITORY_DRIVER = 'memory';

    const moduleRef = await Test.createTestingModule({
      imports: [PlatformModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configurePlatformHttp(app, { globalPrefix: 'api/platform' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (previousRepositoryDriver === undefined) {
      delete process.env.PLATFORM_REPOSITORY_DRIVER;
    } else {
      process.env.PLATFORM_REPOSITORY_DRIVER = previousRepositoryDriver;
    }
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

  it('rejects current user menu requests without access token', async () => {
    const response = await request(app.getHttpServer()).get('/api/platform/menus/my').expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_401',
        message: '未登录',
      }),
    );
  });

  it('rejects protected endpoints with malformed authorization header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .set('Authorization', 'Token not-a-bearer-token')
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_401',
        message: '未登录',
      }),
    );
  });

  it('rejects protected endpoints with unknown access token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .set('Authorization', 'Bearer dev-access-missing')
      .expect(401);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_401',
        message: '登录状态无效',
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

  it('lists menus allowed by the current user permissions', async () => {
    const token = await loginAsAdmin();
    const response = await request(app.getHttpServer())
      .get('/api/platform/menus/my')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '组织架构',
          permissionCode: 'platform:org:view',
        }),
        expect.objectContaining({
          title: '在位看板',
          permissionCode: 'presence:board:view',
        }),
      ]),
    );
  });

  it('lists module manifests for users with platform permission visibility', async () => {
    const token = await loginAsAdmin();
    const response = await request(app.getHttpServer())
      .get('/api/platform/module-manifests')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'platform',
          apiPrefix: '/api/platform',
        }),
        expect.objectContaining({
          moduleName: 'presence',
          apiPrefix: '/api/presence',
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

    const menusResponse = await request(app.getHttpServer())
      .get('/api/platform/menus/my')
      .set('Authorization', `Bearer ${limitedLogin.body.accessToken}`)
      .expect(200);
    expect(menusResponse.body.items).toEqual([]);

    await request(app.getHttpServer())
      .get('/api/platform/module-manifests')
      .set('Authorization', `Bearer ${limitedLogin.body.accessToken}`)
      .expect(403);
  });

  it('rejects invalid request bodies with normalized validation errors', async () => {
    const token = await loginAsAdmin();
    const response = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', 'trace-validation-e2e')
      .send({
        enterpriseId: 'ent-default',
        employeeNo: '000100',
        account: 'invalid-user',
        name: '非法用户',
        initialPassword: 'short',
        unknownField: 'should-be-rejected',
      })
      .expect(400);

    expect(response.headers['x-trace-id']).toBe('trace-validation-e2e');
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'HTTP_400',
        traceId: 'trace-validation-e2e',
      }),
    );
    expect(response.body.message).toContain('initialPassword');
    expect(response.body.message).toContain('unknownField');
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
