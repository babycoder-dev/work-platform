import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GatewayModule } from '../../../../apps/gateway-api/src/gateway.module';

const runE2E = process.env.RUN_POSTGRES_E2E === 'true';
const adminPassword = process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD ?? 'admin123';
const execFileAsync = promisify(execFile);

describe.skipIf(!runE2E)('Presence API e2e', () => {
  let app: INestApplication;
  let pool: Pool;
  let suffix: string;
  let adminToken: string;
  let createToken: string;
  let selfToken: string;
  let noPermissionToken: string;

  beforeAll(async () => {
    suffix = Date.now().toString();
    process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD = adminPassword;
    process.env.PLATFORM_BOOTSTRAP_RESET_ADMIN_PASSWORD = 'true';

    await execFileAsync(
      process.platform === 'win32' ? 'cmd.exe' : 'pnpm',
      process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm db:setup'] : ['db:setup'],
      {
      cwd: process.cwd(),
      env: process.env,
      },
    );

    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://work:work@localhost:5432/work_platform',
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [GatewayModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configurePlatformHttp(app, { globalPrefix: 'api' });
    await app.init();

    adminToken = await login('admin', adminPassword);
    createToken = await createUserWithRole({
      roleCode: `presence-create-${suffix}`,
      account: `presence-create-${suffix}`,
      employeeNo: `PC${suffix}`,
      permissionCodes: ['presence:status:create', 'presence:board:view'],
      dataScope: 'self',
    });
    selfToken = await createUserWithRole({
      roleCode: `presence-self-${suffix}`,
      account: `presence-self-${suffix}`,
      employeeNo: `PS${suffix}`,
      permissionCodes: ['presence:status:create', 'presence:board:view'],
      dataScope: 'self',
    });
    noPermissionToken = await createUserWithRole({
      roleCode: `presence-denied-${suffix}`,
      account: `presence-denied-${suffix}`,
      employeeNo: `PD${suffix}`,
      permissionCodes: [],
      dataScope: 'self',
    });
  });

  afterAll(async () => {
    await cleanupRows();
    await app?.close();
    await pool?.end();
  });

  it('returns 401 without token', async () => {
    await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .send(createPayload())
      .expect(401);
  });

  it('returns 403 without permission', async () => {
    await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .send(createPayload())
      .expect(403);
  });

  it('creates a status record', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${createToken}`)
      .send(createPayload('2026-05-25T01:00:00.000Z'))
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        employeeNo: `PC${suffix}`,
        status: 'business_trip',
        createdBy: expect.any(String),
        createdAt: expect.any(String),
      }),
    );
  });

  it('returns 409 for overlapping records', async () => {
    await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${createToken}`)
      .send(createPayload('2026-05-25T03:00:00.000Z'))
      .expect(409);
  });

  it('cancels a status record', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${selfToken}`)
      .send(createPayload('2026-05-26T01:00:00.000Z', '2026-05-26T09:00:00.000Z'))
      .expect(201);

    const cancelResponse = await request(app.getHttpServer())
      .delete(`/api/presence/status-records/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${selfToken}`)
      .expect(200);

    expect(cancelResponse.body.cancelledAt).toEqual(expect.any(String));
  });

  it('filters board records by self scope', async () => {
    await request(app.getHttpServer())
      .post('/api/presence/status-records')
      .set('Authorization', `Bearer ${selfToken}`)
      .send(createPayload(new Date(Date.now() - 60_000).toISOString(), null))
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/presence/board')
      .set('Authorization', `Bearer ${selfToken}`)
      .expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeNo: `PS${suffix}`,
        }),
      ]),
    );
    expect(response.body.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employeeNo: `PC${suffix}`,
        }),
      ]),
    );
  });

  async function createUserWithRole(input: {
    roleCode: string;
    account: string;
    employeeNo: string;
    permissionCodes: string[];
    dataScope: 'self' | 'department' | 'department_tree' | 'company' | 'custom';
  }): Promise<string> {
    const departmentId = randomUUID();
    await pool.query(
      `
        INSERT INTO platform.departments (id, enterprise_id, code, name, status)
        VALUES ($1, '00000000-0000-0000-0000-000000000001', $2, $3, 'active')
      `,
      [departmentId, `PD${input.employeeNo}`, `Presence E2E ${input.employeeNo}`],
    );

    const roleResponse = await request(app.getHttpServer())
      .post('/api/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        code: input.roleCode,
        name: input.roleCode,
        permissionCodes: input.permissionCodes,
        dataScope: input.dataScope,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        departmentId,
        employeeNo: input.employeeNo,
        account: input.account,
        name: input.account,
        initialPassword: 'Presence123',
        roleIds: [roleResponse.body.id],
      })
      .expect(201);

    return login(input.account, 'Presence123');
  }

  async function login(account: string, password: string): Promise<string> {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        account,
        password,
      })
      .expect(201);

    return loginResponse.body.accessToken;
  }

  function createPayload(startAt = '2026-05-25T01:00:00.000Z', endAt: string | null = '2026-05-25T09:00:00.000Z') {
    return {
      status: 'business_trip',
      startAt,
      ...(endAt === null ? {} : { endAt }),
      remark: `presence e2e ${suffix}`,
    };
  }

  async function cleanupRows(): Promise<void> {
    if (!pool) {
      return;
    }
    await pool.query('DELETE FROM presence.status_records WHERE employee_no LIKE $1', [`P_${suffix}`]);
    await pool.query('DELETE FROM platform.audit_logs WHERE actor_account LIKE $1', [`presence-%-${suffix}`]);
    await pool.query(
      `
        DELETE FROM platform.user_roles
        WHERE user_id IN (SELECT id FROM platform.employees WHERE account LIKE $1)
           OR role_id IN (SELECT id FROM platform.roles WHERE code LIKE $1)
      `,
      [`presence-%-${suffix}`],
    );
    await pool.query('DELETE FROM platform.local_identities WHERE account LIKE $1', [`presence-%-${suffix}`]);
    await pool.query('DELETE FROM platform.employees WHERE account LIKE $1', [`presence-%-${suffix}`]);
    await pool.query(
      `
        DELETE FROM platform.role_permissions
        WHERE role_id IN (SELECT id FROM platform.roles WHERE code LIKE $1)
      `,
      [`presence-%-${suffix}`],
    );
    await pool.query('DELETE FROM platform.roles WHERE code LIKE $1', [`presence-%-${suffix}`]);
    await pool.query('DELETE FROM platform.departments WHERE code LIKE $1', [`PDP%${suffix}`]);
  }
});
