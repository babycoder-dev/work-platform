import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configurePlatformHttp } from '@work/nest-common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readPlatformDatabaseConfig } from './db/db.config';
import { runMigrations } from './db/migrate';
import { PlatformModule } from './platform.module';
import { DEFAULT_ADMIN_ROLE_ID } from './seeds/seed-data';
import { seedPlatform } from './seeds/seed-platform';
import { hashPassword, verifyPassword } from './security/secret-hash';

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
        dataScopes: [{ dataType: 'profile', scope: 'self' }],
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

  it('round-trips role details and rejects protected or in-use role mutations', async () => {
    const suffix = Date.now().toString();
    const loginResponse = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: adminPassword,
      })
      .expect(201);
    const token = loginResponse.body.accessToken as string;
    const roleResponse = await request(app.getHttpServer())
      .post('/api/platform/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        code: `pg-role-api-${suffix}`,
        name: 'PG Role API',
        permissionCodes: ['platform:employee:view'],
        dataScopes: [{ dataType: 'profile', scope: 'department' }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/platform/roles/${roleResponse.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(roleResponse.body);
      });
    for (const method of ['patch', 'delete'] as const) {
      await request(app.getHttpServer())[method](`/api/platform/roles/${DEFAULT_ADMIN_ROLE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send(method === 'patch' ? { name: 'Changed Admin' } : undefined)
        .expect(409)
        .expect((response) => {
          expect(response.body.code).toBe('PLATFORM_ROLE_PROTECTED');
        });
    }

    const employeeResponse = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        employeeNo: `RA${suffix}`,
        account: `pg-role-api-${suffix}`,
        name: 'PG Role API User',
        initialPassword: 'Passw0rd1',
      })
      .expect(201);
    await request(app.getHttpServer())
      .put(`/api/platform/employees/${employeeResponse.body.id}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleIds: [roleResponse.body.id] })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/platform/roles/${roleResponse.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('PLATFORM_ROLE_IN_USE');
      });
  });

  it('hides cross-tenant roles and rejects cross-tenant employee references', async () => {
    const suffix = Date.now().toString();
    const loginResponse = await request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account: 'admin',
        password: adminPassword,
      })
      .expect(201);
    const token = loginResponse.body.accessToken as string;
    const enterprise = await pool.query<{ id: string }>(
      `
        INSERT INTO platform.enterprises (code, name, status)
        VALUES ($1, $2, 'active')
        RETURNING id
      `,
      [`pg-security-${suffix}`, 'PG Security Tenant'],
    );
    const foreignEnterpriseId = enterprise.rows[0].id;
    const department = await pool.query<{ id: string }>(
      `
        INSERT INTO platform.departments (enterprise_id, code, name, status)
        VALUES ($1, $2, $3, 'active')
        RETURNING id
      `,
      [foreignEnterpriseId, `PGSEC${suffix}`, 'PG Security Department'],
    );
    const foreignDepartmentId = department.rows[0].id;
    const role = await pool.query<{ id: string }>(
      `
        INSERT INTO platform.roles (enterprise_id, code, name, status)
        VALUES ($1, $2, $3, 'active')
        RETURNING id
      `,
      [foreignEnterpriseId, `pg-security-role-${suffix}`, 'PG Security Role'],
    );
    const foreignRoleId = role.rows[0].id;
    const target = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        employeeNo: `PGSEC${suffix}`,
        account: `pg-security-target-${suffix}`,
        name: 'PG Security Target',
        initialPassword: 'Passw0rd1',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/platform/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: foreignRoleId })]));
      });
    for (const method of ['get', 'patch', 'delete'] as const) {
      await request(app.getHttpServer())[method](`/api/platform/roles/${foreignRoleId}`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Trace-Id', `trace-pg-security-role-${method}-${suffix}`)
        .send(method === 'patch' ? { name: 'Changed Foreign Role' } : undefined)
        .expect(404);
    }
    await request(app.getHttpServer())
      .put(`/api/platform/employees/${target.body.id}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-pg-security-assign-${suffix}`)
      .send({ roleIds: [foreignRoleId] })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-pg-security-department-${suffix}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        departmentId: foreignDepartmentId,
        employeeNo: `PGDEPT${suffix}`,
        account: `pg-security-department-${suffix}`,
        name: 'PG Security Department Boundary',
        initialPassword: 'Passw0rd1',
      })
      .expect(404);
    const oversizedId = 'x'.repeat(256);
    await request(app.getHttpServer())
      .patch(`/api/platform/roles/${oversizedId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-pg-security-role-oversized-${suffix}`)
      .send({ name: 'Oversized Role Id' })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/platform/employees/${oversizedId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-pg-security-assign-oversized-${suffix}`)
      .send({ roleIds: [] })
      .expect(404);
    const foreignEmployee = await pool.query<{ id: string }>(
      `
        INSERT INTO platform.employees (
          enterprise_id,
          department_id,
          employee_no,
          account,
          name,
          status,
          must_change_password
        )
        VALUES ($1, $2, $3, $4, $5, 'active', true)
        RETURNING id
      `,
      [
        foreignEnterpriseId,
        foreignDepartmentId,
        `PGFEMP${suffix}`,
        `pg-security-foreign-employee-${suffix}`,
        'PG Security Foreign Employee',
      ],
    );
    const foreignEmployeeId = foreignEmployee.rows[0].id;
    await pool.query(
      `
        INSERT INTO platform.local_identities (user_id, account, password_hash, must_change_password)
        VALUES ($1, $2, $3, true)
      `,
      [foreignEmployeeId, `pg-security-foreign-employee-${suffix}`, hashPassword('Foreign123')],
    );
    await request(app.getHttpServer())
      .put(`/api/platform/employees/${foreignEmployeeId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-pg-security-status-${suffix}`)
      .send({ status: 'disabled' })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/platform/employees/${foreignEmployeeId}/password`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Trace-Id', `trace-pg-security-password-${suffix}`)
      .send({ newPassword: 'Changed123' })
      .expect(404);

    await expect(pool.query('SELECT role_id FROM platform.user_roles WHERE user_id = $1', [target.body.id])).resolves.toMatchObject({
      rowCount: 0,
    });
    await expect(pool.query('SELECT status, must_change_password FROM platform.employees WHERE id = $1', [foreignEmployeeId])).resolves.toMatchObject({
      rows: [expect.objectContaining({ status: 'active', must_change_password: true })],
    });
    const foreignIdentity = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM platform.local_identities WHERE user_id = $1',
      [foreignEmployeeId],
    );
    expect(verifyPassword('Foreign123', foreignIdentity.rows[0].password_hash)).toBe(true);
    expect(verifyPassword('Changed123', foreignIdentity.rows[0].password_hash)).toBe(false);
    await expect(pool.query('SELECT id FROM platform.employees WHERE account = $1', [`pg-security-department-${suffix}`])).resolves.toMatchObject({
      rowCount: 0,
    });
    await expect(fetchFailureAuditActionsByTraceSuffix(pool, suffix)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'platform.role.update', result: 'failure' }),
        expect.objectContaining({ action: 'platform.role.delete', result: 'failure' }),
        expect.objectContaining({ action: 'platform.employee.roles.assign', result: 'failure' }),
        expect.objectContaining({ action: 'platform.employee.create', result: 'failure' }),
        expect.objectContaining({ action: 'platform.employee.status.update', result: 'failure' }),
        expect.objectContaining({ action: 'platform.employee.password.reset', result: 'failure' }),
      ]),
    );
    await expect(fetchAuditResourceIdsByTraceSuffix(pool, suffix)).resolves.toEqual(
      expect.arrayContaining([
        'x'.repeat(128),
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

  describe('employee list scope filtering', () => {
    it('filters employees by company, department, self, custom, department_tree, and enterprise', async () => {
      const suffix = Date.now().toString();
      const adminLogin = await request(app.getHttpServer())
        .post('/api/platform/auth/login')
        .send({
          account: 'admin',
          password: adminPassword,
        })
        .expect(201);
      const adminToken = adminLogin.body.accessToken as string;

      try {
        const adminVisible = await createEmployee(adminToken, suffix, {
          employeeNo: `PSCA${suffix}`,
          account: `pg-scope-admin-${suffix}`,
          name: 'PG Scope Admin Visible',
        });
        const adminList = await request(app.getHttpServer())
          .get('/api/platform/employees')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        expect(idsOf(adminList.body.items)).toEqual(expect.arrayContaining([adminVisible.body.id]));

        const departmentRole = await createRole(adminToken, suffix, `pg-scope-dept-${suffix}`, 'department');
        const department = await createDepartment(adminToken, suffix, `PSCD${suffix}`, 'PG Scope Department');
        const departmentA = await createEmployee(adminToken, suffix, {
          departmentId: department.body.id,
          employeeNo: `PSCDA${suffix}`,
          account: `pg-scope-dept-a-${suffix}`,
          name: 'PG Scope Department A',
          roleIds: [departmentRole.body.id],
        });
        const departmentB = await createEmployee(adminToken, suffix, {
          departmentId: department.body.id,
          employeeNo: `PSCDB${suffix}`,
          account: `pg-scope-dept-b-${suffix}`,
          name: 'PG Scope Department B',
        });
        const departmentOther = await createEmployee(adminToken, suffix, {
          employeeNo: `PSCDC${suffix}`,
          account: `pg-scope-dept-c-${suffix}`,
          name: 'PG Scope Department C',
        });
        const departmentLogin = await login(`pg-scope-dept-a-${suffix}`);
        const departmentList = await request(app.getHttpServer())
          .get('/api/platform/employees')
          .set('Authorization', `Bearer ${departmentLogin.body.accessToken}`)
          .expect(200);
        expect(idsOf(departmentList.body.items)).toEqual(expect.arrayContaining([departmentA.body.id, departmentB.body.id]));
        expect(idsOf(departmentList.body.items)).not.toContain(departmentOther.body.id);
        expect(idsOf(departmentList.body.items)).not.toContain('00000000-0000-0000-0000-000000000001');

        const selfRole = await createRole(adminToken, suffix, `pg-scope-self-${suffix}`, 'self');
        const selfEmployee = await createEmployee(adminToken, suffix, {
          employeeNo: `PSCS${suffix}`,
          account: `pg-scope-self-${suffix}`,
          name: 'PG Scope Self',
          roleIds: [selfRole.body.id],
        });
        const selfLogin = await login(`pg-scope-self-${suffix}`);
        const selfList = await request(app.getHttpServer())
          .get('/api/platform/employees')
          .set('Authorization', `Bearer ${selfLogin.body.accessToken}`)
          .expect(200);
        expect(idsOf(selfList.body.items)).toEqual([selfEmployee.body.id]);

        const customRole = await createRole(adminToken, suffix, `pg-scope-custom-${suffix}`, 'custom');
        const customEmployee = await createEmployee(adminToken, suffix, {
          employeeNo: `PSCC${suffix}`,
          account: `pg-scope-custom-${suffix}`,
          name: 'PG Scope Custom',
          roleIds: [customRole.body.id],
        });
        const customLogin = await login(`pg-scope-custom-${suffix}`);
        const customList = await request(app.getHttpServer())
          .get('/api/platform/employees')
          .set('Authorization', `Bearer ${customLogin.body.accessToken}`)
          .expect(200);
        expect(idsOf(customList.body.items)).toEqual([customEmployee.body.id]);

        const treeParent = await createDepartment(adminToken, suffix, `PSCT${suffix}`, 'PG Scope Tree Parent');
        const treeChild = await createDepartment(adminToken, suffix, `PSCTC${suffix}`, 'PG Scope Tree Child', treeParent.body.id);
        const treeRole = await createRole(adminToken, suffix, `pg-scope-tree-${suffix}`, 'department_tree');
        const treeParentEmployee = await createEmployee(adminToken, suffix, {
          departmentId: treeParent.body.id,
          employeeNo: `PSCTP${suffix}`,
          account: `pg-scope-tree-parent-${suffix}`,
          name: 'PG Scope Tree Parent',
          roleIds: [treeRole.body.id],
        });
        const treeChildEmployee = await createEmployee(adminToken, suffix, {
          departmentId: treeChild.body.id,
          employeeNo: `PSCTC${suffix}`,
          account: `pg-scope-tree-child-${suffix}`,
          name: 'PG Scope Tree Child',
        });
        const treeOutside = await createEmployee(adminToken, suffix, {
          employeeNo: `PSCTO${suffix}`,
          account: `pg-scope-tree-outside-${suffix}`,
          name: 'PG Scope Tree Outside',
        });
        const treeLogin = await login(`pg-scope-tree-parent-${suffix}`);
        const treeList = await request(app.getHttpServer())
          .get('/api/platform/employees')
          .set('Authorization', `Bearer ${treeLogin.body.accessToken}`)
          .expect(200);
        expect(idsOf(treeList.body.items)).toEqual(expect.arrayContaining([treeParentEmployee.body.id, treeChildEmployee.body.id]));
        expect(idsOf(treeList.body.items)).not.toContain(treeOutside.body.id);
        expect(idsOf(treeList.body.items)).not.toContain('00000000-0000-0000-0000-000000000001');

        const enterprise2Id = randomUUID();
        const department2Id = randomUUID();
        const employee2Id = randomUUID();
        await pool.query(
          `
            INSERT INTO platform.enterprises (id, code, name, status)
            VALUES ($1, $2, $3, 'active')
          `,
          [enterprise2Id, `pg-scope-ent-${suffix}`, 'PG Scope Enterprise 2'],
        );
        await pool.query(
          `
            INSERT INTO platform.departments (id, enterprise_id, code, name, status)
            VALUES ($1, $2, $3, $4, 'active')
          `,
          [department2Id, enterprise2Id, `pg-scope-dept-${suffix}`, 'PG Scope Enterprise 2 Department'],
        );
        await pool.query(
          `
            INSERT INTO platform.employees (
              id,
              enterprise_id,
              department_id,
              employee_no,
              account,
              name,
              status,
              must_change_password
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'active', true)
          `,
          [employee2Id, enterprise2Id, department2Id, `PSE2${suffix}`, `pg-scope-ent2-${suffix}`, 'PG Scope Enterprise 2 User'],
        );

        const adminListAfterEnterprise2 = await request(app.getHttpServer())
          .get('/api/platform/employees')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
        expect(idsOf(adminListAfterEnterprise2.body.items)).not.toContain(employee2Id);
      } finally {
        await cleanupScopeRows(pool, suffix);
      }
    });
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

  function createDepartment(token: string, suffix: string, code: string, name: string, parentId?: string) {
    void suffix;
    return request(app.getHttpServer())
      .post('/api/platform/departments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        parentId,
        code,
        name,
      })
      .expect(201);
  }

  function createRole(token: string, suffix: string, code: string, dataScope: 'self' | 'department' | 'department_tree' | 'company' | 'custom') {
    void suffix;
    return request(app.getHttpServer())
      .post('/api/platform/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        code,
        name: code,
        permissionCodes: ['platform:employee:view'],
        dataScopes: [{ dataType: 'profile', scope: dataScope }],
      })
      .expect(201);
  }

  async function createEmployee(
    token: string,
    suffix: string,
    input: {
      employeeNo: string;
      account: string;
      name: string;
      departmentId?: string;
      roleIds?: string[];
    },
  ) {
    void suffix;
    const response = await request(app.getHttpServer())
      .post('/api/platform/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        enterpriseId: '00000000-0000-0000-0000-000000000001',
        departmentId: input.departmentId,
        employeeNo: input.employeeNo,
        account: input.account,
        name: input.name,
        initialPassword: 'Scope1234',
      })
      .expect(201);

    if (input.roleIds !== undefined) {
      await request(app.getHttpServer())
        .put(`/api/platform/employees/${response.body.id}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roleIds: input.roleIds,
        })
        .expect(200);
    }

    return response;
  }

  function login(account: string) {
    return request(app.getHttpServer())
      .post('/api/platform/auth/login')
      .send({
        account,
        password: 'Scope1234',
      })
      .expect(201);
  }
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

async function fetchFailureAuditActionsByTraceSuffix(pool: Pool, suffix: string) {
  const auditResult = await pool.query<{
    action: string;
    result: string;
  }>(
    `
      SELECT action, result
      FROM platform.audit_logs
      WHERE trace_id LIKE $1
        AND result = 'failure'
      ORDER BY created_at ASC
    `,
    [`trace-pg-security-%-${suffix}`],
  );

  return auditResult.rows;
}

async function fetchAuditResourceIdsByTraceSuffix(pool: Pool, suffix: string) {
  const auditResult = await pool.query<{ resource_id: string | null }>(
    `
      SELECT resource_id
      FROM platform.audit_logs
      WHERE trace_id LIKE $1
      ORDER BY created_at ASC
    `,
    [`trace-pg-security-%-oversized-${suffix}`],
  );

  return auditResult.rows.map((row) => row.resource_id);
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

function idsOf(items: Array<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

async function cleanupScopeRows(pool: Pool, suffix: string): Promise<void> {
  await pool.query(
    `
      DELETE FROM platform.audit_logs
      WHERE actor_account LIKE $1 OR trace_id LIKE $2
    `,
    [`pg-scope-%-${suffix}`, `%${suffix}`],
  );
  await pool.query(
    `
      DELETE FROM platform.user_roles
      WHERE user_id IN (
        SELECT id FROM platform.employees WHERE account LIKE $1
      )
      OR role_id IN (
        SELECT id FROM platform.roles WHERE code LIKE $1
      )
    `,
    [`pg-scope-%-${suffix}`],
  );
  await pool.query('DELETE FROM platform.local_identities WHERE account LIKE $1', [`pg-scope-%-${suffix}`]);
  await pool.query('DELETE FROM platform.employees WHERE account LIKE $1', [`pg-scope-%-${suffix}`]);
  await pool.query(
    `
      DELETE FROM platform.role_permissions
      WHERE role_id IN (
        SELECT id FROM platform.roles WHERE code LIKE $1
      )
    `,
    [`pg-scope-%-${suffix}`],
  );
  await pool.query('DELETE FROM platform.roles WHERE code LIKE $1', [`pg-scope-%-${suffix}`]);
  await pool.query('DELETE FROM platform.departments WHERE code LIKE $1', [`PSC%${suffix}`]);
  await pool.query('DELETE FROM platform.departments WHERE code LIKE $1', [`pg-scope-dept-${suffix}`]);
  await pool.query('DELETE FROM platform.enterprises WHERE code = $1', [`pg-scope-ent-${suffix}`]);
}
