import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './db/migrate';
import { PlatformModule } from './platform.module';
import { seedPlatform } from './seeds/seed-platform';

const runPostgresE2E = process.env.RUN_POSTGRES_E2E === 'true';
const adminPassword = process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD ?? 'admin123';

describe.skipIf(!runPostgresE2E)('platform-api postgres repository', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.PLATFORM_REPOSITORY_DRIVER = 'postgres';
    process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD ??= adminPassword;

    await runMigrations();
    await seedPlatform();

    const moduleRef = await Test.createTestingModule({
      imports: [PlatformModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configurePlatformHttp(app, { globalPrefix: 'api/platform' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('logs in with seeded postgres admin and persists an access session', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: adminPassword,
      })
      .expect(201);

    expect(loginResponse.body.user.name).toBe('系统管理员');
    expect(loginResponse.body.user.permissions.length).toBeGreaterThan(0);

    const departmentsResponse = await request(app.getHttpServer())
      .get('/api/platform/departments')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200);

    expect(departmentsResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HQ',
          name: '总部',
        }),
      ]),
    );
  });

  it('creates a postgres-backed employee with a hashed local identity', async () => {
    const uniqueSuffix = Date.now().toString();
    const account = `postgres-user-${uniqueSuffix}`;
    const employeeNo = `PG${uniqueSuffix}`;
    const loginResponse = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: adminPassword,
      })
      .expect(201);

    const employeeResponse = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        departmentId: '00000000-0000-0000-0000-000000000002',
        employeeNo,
        account,
        name: 'Postgres User',
        initialPassword: 'Passw0rd1',
      })
      .expect(201);

    expect(employeeResponse.body).toEqual(
      expect.objectContaining({
        account,
        employeeNo,
        roleIds: [],
      }),
    );

    const limitedLoginResponse = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account,
        password: 'Passw0rd1',
      })
      .expect(201);

    expect(limitedLoginResponse.body.user.name).toBe('Postgres User');
    expect(limitedLoginResponse.body.user.permissions).toEqual([]);
  });
});
