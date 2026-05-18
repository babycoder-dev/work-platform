import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readPlatformDatabaseConfig } from '../db/db.config';
import { runMigrations } from '../db/migrate';
import {
  DEFAULT_ADMIN_USER_ID,
  DEFAULT_DEPARTMENT_ID,
  DEFAULT_ENTERPRISE_ID,
} from '../seeds/seed-data';
import { seedPlatform } from '../seeds/seed-platform';
import { PostgresPlatformRepository } from './postgres-platform.repository';

const runPostgresIntegration = process.env.RUN_POSTGRES_INTEGRATION === 'true';

describe.skipIf(!runPostgresIntegration)('PostgresPlatformRepository integration', () => {
  let pool: Pool;
  let repository: PostgresPlatformRepository;

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'production';
    process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD ??= 'ci-admin-password';

    await runMigrations();
    await seedPlatform();

    const databaseConfig = readPlatformDatabaseConfig();
    pool = new Pool({
      connectionString: databaseConfig.databaseUrl,
      ssl: databaseConfig.ssl ? { rejectUnauthorized: false } : undefined,
    });
    repository = new PostgresPlatformRepository(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('creates employees, roles, assignments, and sessions transactionally', async () => {
    const suffix = Date.now().toString();
    const role = await repository.createRole({
      enterpriseId: DEFAULT_ENTERPRISE_ID,
      code: `integration-role-${suffix}`,
      name: 'Integration Role',
      dataScope: 'department',
      permissionCodes: ['platform:org:view', 'platform:employee:view'],
    });

    expect(role.permissionCodes).toEqual(['platform:org:view', 'platform:employee:view']);

    const employee = await repository.createEmployee({
      enterpriseId: DEFAULT_ENTERPRISE_ID,
      departmentId: DEFAULT_DEPARTMENT_ID,
      employeeNo: `IT${suffix}`,
      account: `integration-user-${suffix}`,
      name: 'Integration User',
      initialPassword: 'Passw0rd1',
      roleIds: [role.id],
    });

    expect(employee.roleIds).toEqual([role.id]);
    await expect(repository.validatePassword(employee.account, 'Passw0rd1')).resolves.toMatchObject({
      id: employee.id,
    });

    const reassigned = await repository.setUserRoles(employee.id, []);
    expect(reassigned).toMatchObject({
      id: employee.id,
      roleIds: [],
    });

    const accessToken = `integration-token-${suffix}`;
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await repository.createAccessSession({
      accessToken,
      userId: employee.id,
      expiresAt,
    });

    await expect(repository.findAccessSession(accessToken)).resolves.toEqual({
      accessToken,
      userId: employee.id,
      expiresAt,
    });

    const storedSession = await pool.query<{ access_token_hash: string }>(
      `
        SELECT access_token_hash
        FROM platform.sessions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [employee.id],
    );
    expect(storedSession.rows[0].access_token_hash).not.toBe(accessToken);

    await repository.recordAuditLog({
      actorUserId: employee.id,
      actorAccount: employee.account,
      action: 'integration.audit',
      resourceType: 'platform.employee',
      resourceId: employee.id,
      result: 'success',
      metadata: {
        source: 'repository.integration',
      },
    });
    const auditLog = await pool.query<{ action: string; actor_account: string }>(
      `
        SELECT action, actor_account
        FROM platform.audit_logs
        WHERE action = 'integration.audit'
        ORDER BY created_at DESC
        LIMIT 1
      `,
    );
    expect(auditLog.rows[0]).toEqual({
      action: 'integration.audit',
      actor_account: employee.account,
    });
  });

  it('lists menus allowed by permission codes', async () => {
    await expect(repository.listMenusByPermissionCodes(['platform:org:view'])).resolves.toEqual([
      expect.objectContaining({
        title: '组织架构',
        permissionCode: 'platform:org:view',
      }),
    ]);
  });

  it('maps unique constraint violations to platform duplicate errors', async () => {
    await expect(
      repository.createDepartment({
        enterpriseId: DEFAULT_ENTERPRISE_ID,
        code: 'HQ',
        name: 'Duplicate HQ',
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_DUPLICATE_RESOURCE',
      status: 409,
    });
  });

  it('maps foreign key violations to platform reference errors and rolls back transactions', async () => {
    const roleCode = `missing-permission-${Date.now().toString()}`;

    await expect(
      repository.createRole({
        enterpriseId: DEFAULT_ENTERPRISE_ID,
        code: roleCode,
        name: 'Missing Permission Role',
        dataScope: 'self',
        permissionCodes: ['platform:missing:permission'],
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_REFERENCE_NOT_FOUND',
      status: 400,
    });

    const roles = await repository.listRoles();
    expect(roles.some((role) => role.code === roleCode)).toBe(false);
  });

  it('maps invalid role assignments to platform reference errors', async () => {
    await expect(
      repository.setUserRoles(DEFAULT_ADMIN_USER_ID, ['00000000-0000-0000-0000-00000000ffff']),
    ).rejects.toMatchObject({
      code: 'PLATFORM_REFERENCE_NOT_FOUND',
      status: 400,
    });
  });
});
