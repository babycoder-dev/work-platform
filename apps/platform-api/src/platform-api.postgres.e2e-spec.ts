import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readPlatformDatabaseConfig } from './db/db.config';
import { runMigrations } from './db/migrate';
import { PlatformModule } from './platform.module';
import { seedPlatform } from './seeds/seed-platform';

const runPostgresE2E = process.env.RUN_POSTGRES_E2E === 'true';
const adminPassword = process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD ?? 'admin123';

describe.skipIf(!runPostgresE2E)('platform-api postgres repository', () => {
  let app: INestApplication;
  let pool: Pool;
  let previousRepositoryDriver: string | undefined;

  beforeAll(async () => {
    previousRepositoryDriver = process.env.PLATFORM_REPOSITORY_DRIVER;
    delete process.env.PLATFORM_REPOSITORY_DRIVER;
    process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD ??= adminPassword;

    await runMigrations();
    await seedPlatform();
    const databaseConfig = readPlatformDatabaseConfig();
    pool = new Pool({
      connectionString: databaseConfig.databaseUrl,
      ssl: databaseConfig.ssl ? { rejectUnauthorized: false } : undefined,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [PlatformModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configurePlatformHttp(app, { globalPrefix: 'api/platform' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (previousRepositoryDriver === undefined) {
      delete process.env.PLATFORM_REPOSITORY_DRIVER;
    } else {
      process.env.PLATFORM_REPOSITORY_DRIVER = previousRepositoryDriver;
    }
  });

  it('logs in with seeded postgres admin and persists an access session', async () => {
    const auditCountBeforeLogin = await countSuccessfulAdminLogins(pool);
    const loginResponse = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .set('X-Trace-Id', 'trace-postgres-login')
      .set('X-Forwarded-For', '203.0.113.10, 10.0.0.1')
      .set('User-Agent', 'postgres-e2e-agent')
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

    const menusResponse = await request(app.getHttpServer())
      .get('/api/platform/menus/my')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200);

    expect(menusResponse.body.items).toEqual(
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

    const auditCountAfterLogin = await countSuccessfulAdminLogins(pool);
    expect(auditCountAfterLogin).toBeGreaterThan(auditCountBeforeLogin);
    await expect(fetchLatestSuccessfulAdminLogin(pool)).resolves.toEqual(
      expect.objectContaining({
        trace_id: 'trace-postgres-login',
        ip: '203.0.113.10',
        user_agent: 'postgres-e2e-agent',
      }),
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

async function countSuccessfulAdminLogins(pool: Pool): Promise<number> {
  const auditResult = await pool.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM platform.audit_logs
      WHERE trace_id = 'trace-postgres-login'
        AND actor_account = 'admin'
        AND action = 'auth.login'
        AND result = 'success'
    `,
  );

  return Number(auditResult.rows[0].count);
}

async function fetchLatestSuccessfulAdminLogin(pool: Pool) {
  const auditResult = await pool.query<{ trace_id: string | null; ip: string | null; user_agent: string | null }>(
    `
      SELECT trace_id, ip, user_agent
      FROM platform.audit_logs
      WHERE actor_account = 'admin'
        AND action = 'auth.login'
        AND result = 'success'
      ORDER BY created_at DESC
      LIMIT 1
    `,
  );

  return auditResult.rows[0];
}
