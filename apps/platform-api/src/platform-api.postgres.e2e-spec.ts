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
import { hashPassword } from './security/secret-hash';

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
    await pool.query(
      `
        UPDATE platform.local_identities
        SET password_hash = $1,
            failed_attempts = 0,
            locked_until = NULL,
            must_change_password = true,
            updated_at = now()
        WHERE account = 'admin'
      `,
      [hashPassword(adminPassword)],
    );
    await pool.query(
      `
        UPDATE platform.employees
        SET must_change_password = true, updated_at = now()
        WHERE account = 'admin'
      `,
    );

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
        expect.objectContaining({
          title: '状态登记',
          permissionCode: 'presence:status:create',
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

  it('creates postgres-backed platform resources and writes audit logs', async () => {
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

    const departmentResponse = await request(app.getHttpServer())
      .post('/api/platform/departments')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .set('X-Trace-Id', `trace-postgres-department-${uniqueSuffix}`)
      .set('X-Forwarded-For', '203.0.113.20, 10.0.0.1')
      .set('User-Agent', 'postgres-write-agent')
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        code: `PGD${uniqueSuffix}`,
        name: 'Postgres Department',
      })
      .expect(201);

    const roleResponse = await request(app.getHttpServer())
      .post('/api/platform/roles')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .set('X-Trace-Id', `trace-postgres-role-${uniqueSuffix}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        code: `postgres-role-${uniqueSuffix}`,
        name: 'Postgres Role',
        permissionCodes: ['platform:org:view'],
        dataScope: 'self',
      })
      .expect(201);

    const employeeResponse = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .set('X-Trace-Id', `trace-postgres-employee-${uniqueSuffix}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        departmentId: departmentResponse.body.id,
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

    await request(app.getHttpServer())
      .put(`/api/platform/employees/${employeeResponse.body.id}/status`)
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .set('X-Trace-Id', `trace-postgres-status-${uniqueSuffix}`)
      .send({
        status: 'disabled',
      })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/api/platform/employees/${employeeResponse.body.id}/roles`)
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .set('X-Trace-Id', `trace-postgres-roles-${uniqueSuffix}`)
      .send({
        roleIds: [roleResponse.body.id],
      })
      .expect(200);

    await expect(fetchAuditActionsByTraceSuffix(pool, uniqueSuffix)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'platform.department.create',
          trace_id: `trace-postgres-department-${uniqueSuffix}`,
          ip: '203.0.113.20',
          user_agent: 'postgres-write-agent',
        }),
        expect.objectContaining({
          action: 'platform.role.create',
          trace_id: `trace-postgres-role-${uniqueSuffix}`,
        }),
        expect.objectContaining({
          action: 'platform.employee.create',
          trace_id: `trace-postgres-employee-${uniqueSuffix}`,
        }),
        expect.objectContaining({
          action: 'platform.employee.status.update',
          trace_id: `trace-postgres-status-${uniqueSuffix}`,
        }),
        expect.objectContaining({
          action: 'platform.employee.roles.assign',
          trace_id: `trace-postgres-roles-${uniqueSuffix}`,
        }),
      ]),
    );
  });

  it('locks postgres-backed accounts after five wrong passwords', async () => {
    const uniqueSuffix = Date.now().toString();
    const account = `lockout-test-${uniqueSuffix}`;
    const loginResponse = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: adminPassword,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        employeeNo: `LK${uniqueSuffix}`,
        account,
        name: 'Lockout Test User',
        initialPassword: 'Passw0rd1',
      })
      .expect(201);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/platform/auth/login')
        .send({
          account,
          password: 'wrong-password',
        })
        .expect(401)
        .expect((response) => {
          expect(response.body.message).toBe('账号或密码错误');
        });
    }

    await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account,
        password: 'wrong-password',
      })
      .expect(401)
      .expect((response) => {
        expect(response.body.message).toContain('账号已被锁定');
      });

    await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account,
        password: 'Passw0rd1',
      })
      .expect(401)
      .expect((response) => {
        expect(response.body.message).toContain('账号已被锁定');
      });

    await expect(fetchLoginAuditsByAccount(pool, account)).resolves.toEqual([
      expect.objectContaining({
        result: 'failure',
        metadata: expect.objectContaining({
          failedAttempts: 1,
          locked: false,
          reason: 'wrong_password',
        }),
      }),
      expect.objectContaining({
        result: 'failure',
        metadata: expect.objectContaining({
          failedAttempts: 2,
          locked: false,
          reason: 'wrong_password',
        }),
      }),
      expect.objectContaining({
        result: 'failure',
        metadata: expect.objectContaining({
          failedAttempts: 3,
          locked: false,
          reason: 'wrong_password',
        }),
      }),
      expect.objectContaining({
        result: 'failure',
        metadata: expect.objectContaining({
          failedAttempts: 4,
          locked: false,
          reason: 'wrong_password',
        }),
      }),
      expect.objectContaining({
        result: 'failure',
        metadata: expect.objectContaining({
          failedAttempts: 5,
          locked: true,
          reason: 'wrong_password',
        }),
      }),
      expect.objectContaining({
        result: 'failure',
        metadata: expect.objectContaining({
          reason: 'account_locked',
        }),
      }),
    ]);
  });

  it('changes and resets postgres-backed passwords', async () => {
    const uniqueSuffix = Date.now().toString();
    const account = `password-test-${uniqueSuffix}`;
    const adminLogin = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: adminPassword,
      })
      .expect(201);
    expect(adminLogin.body.user.mustChangePassword).toBe(true);

    await request(app.getHttpServer())
      .post('/api/platform/auth/change-password')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({
        oldPassword: adminPassword,
        newPassword: 'PgNewpass1',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual({ success: true });
      });

    const meResponse = await request(app.getHttpServer())
      .get('/api/platform/auth/me')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .expect(200);
    expect(meResponse.body.mustChangePassword).toBe(false);

    await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: adminPassword,
      })
      .expect(401);

    const changedAdminLogin = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: 'PgNewpass1',
      })
      .expect(201);
    expect(changedAdminLogin.body.user.mustChangePassword).toBe(false);

    await request(app.getHttpServer())
      .post('/api/platform/auth/change-password')
      .set('Authorization', `Bearer ${changedAdminLogin.body.accessToken}`)
      .send({
        oldPassword: 'wrong',
        newPassword: 'Other1234',
      })
      .expect(401)
      .expect((response) => {
        expect(response.body.message).toBe('原密码错误');
      });
    await expect(fetchLocalIdentityFailedAttempts(pool, 'admin')).resolves.toBe(0);

    const employeeResponse = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${changedAdminLogin.body.accessToken}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        employeeNo: `PW${uniqueSuffix}`,
        account,
        name: 'Password Test User',
        initialPassword: 'Passw0rd1',
      })
      .expect(201);

    const employeeLogin = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account,
        password: 'Passw0rd1',
      })
      .expect(201);

    await request(app.getHttpServer())
      .put('/api/platform/employees/00000000-0000-0000-0000-000000000002/password')
      .set('Authorization', `Bearer ${employeeLogin.body.accessToken}`)
      .send({
        newPassword: 'Manager123',
      })
      .expect(403);

    const resetResponse = await request(app.getHttpServer())
      .put(`/api/platform/employees/${employeeResponse.body.id}/password`)
      .set('Authorization', `Bearer ${changedAdminLogin.body.accessToken}`)
      .send({
        newPassword: 'Manager123',
      })
      .expect(200);
    expect(resetResponse.body.mustChangePassword).toBe(true);

    const resetEmployeeLogin = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account,
        password: 'Manager123',
      })
      .expect(201);
    expect(resetEmployeeLogin.body.user.mustChangePassword).toBe(true);
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

async function fetchAuditActionsByTraceSuffix(pool: Pool, suffix: string) {
  const auditResult = await pool.query<{
    action: string;
    actor_account: string | null;
    trace_id: string | null;
    ip: string | null;
    user_agent: string | null;
  }>(
    `
      SELECT action, actor_account, trace_id, ip, user_agent
      FROM platform.audit_logs
      WHERE trace_id LIKE $1
      ORDER BY created_at ASC
    `,
    [`trace-postgres-%-${suffix}`],
  );

  return auditResult.rows;
}

async function fetchLoginAuditsByAccount(pool: Pool, account: string) {
  const auditResult = await pool.query<{
    result: string;
    metadata: Record<string, unknown>;
  }>(
    `
      SELECT result, metadata
      FROM platform.audit_logs
      WHERE actor_account = $1
        AND action = 'auth.login'
      ORDER BY created_at ASC
    `,
    [account],
  );

  return auditResult.rows;
}

async function fetchLocalIdentityFailedAttempts(pool: Pool, account: string): Promise<number> {
  const identityResult = await pool.query<{ failed_attempts: number }>(
    `
      SELECT failed_attempts
      FROM platform.local_identities
      WHERE account = $1
    `,
    [account],
  );

  return identityResult.rows[0].failed_attempts;
}
