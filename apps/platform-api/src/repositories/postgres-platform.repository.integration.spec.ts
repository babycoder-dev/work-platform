import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readPlatformDatabaseConfig } from '../db/db.config';
import { runMigrations } from '../db/migrate';
import {
  DEFAULT_ADMIN_ROLE_ID,
  DEFAULT_ADMIN_USER_ID,
  DEFAULT_DEPARTMENT_ID,
  DEFAULT_ENTERPRISE_ID,
} from '../seeds/seed-data';
import { seedPlatform } from '../seeds/seed-platform';
import { hashPassword, verifyPassword } from '../security/secret-hash';
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

  it('grants active forms and files manifest permissions to the seeded admin role', async () => {
    const expectedPermissions = [
      'files:object:upload',
      'files:object:view-own',
      'forms:profile-definition:view',
      'forms:profile-definition:manage',
      'forms:report-definition:view',
      'forms:report-definition:manage',
      'forms:record:submit',
      'forms:record:view',
    ];
    const result = await pool.query<{ permission_code: string }>(
      `
        SELECT permission_code
        FROM platform.role_permissions
        WHERE role_id = $1 AND permission_code = ANY($2::text[])
        ORDER BY permission_code
      `,
      [DEFAULT_ADMIN_ROLE_ID, expectedPermissions],
    );

    expect(result.rows.map((row) => row.permission_code)).toEqual([...expectedPermissions].sort());
  });

  it('creates employees, roles, assignments, and sessions transactionally', async () => {
    const suffix = Date.now().toString();
    const role = await repository.createRole({
      enterpriseId: DEFAULT_ENTERPRISE_ID,
      code: `integration-role-${suffix}`,
      name: 'Integration Role',
      dataScopes: [
        { dataType: 'profile', scope: 'company' },
        { dataType: 'presence', scope: 'department' },
      ],
      permissionCodes: ['platform:org:view', 'platform:employee:view'],
    });

    expect(role.permissionCodes).toEqual(['platform:org:view', 'platform:employee:view']);
    await expect(repository.findRoleById(role.id)).resolves.toEqual(
      expect.objectContaining({
        dataScopes: [
          { dataType: 'presence', scope: 'department' },
          { dataType: 'profile', scope: 'company' },
        ],
        isSystem: false,
      }),
    );

    const employee = await repository.createEmployee({
      enterpriseId: DEFAULT_ENTERPRISE_ID,
      departmentId: DEFAULT_DEPARTMENT_ID,
      employeeNo: `IT${suffix}`,
      account: `integration-user-${suffix}`,
      name: 'Integration User',
      initialPassword: 'Passw0rd1',
    });

    await expect(repository.setUserRoles(employee.id, [role.id], DEFAULT_ENTERPRISE_ID)).resolves.toEqual(
      expect.objectContaining({ roleIds: [role.id] }),
    );
    const identity = await repository.findLocalIdentityByAccount(employee.account);
    expect(identity).toEqual(
      expect.objectContaining({
        userId: employee.id,
        account: employee.account,
        failedAttempts: 0,
      }),
    );
    expect(identity?.lockedUntil).toBeUndefined();
    expect(verifyPassword('Passw0rd1', identity?.passwordHash ?? '')).toBe(true);

    const reassigned = await repository.setUserRoles(employee.id, [], DEFAULT_ENTERPRISE_ID);
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

    await repository.recordAuditLog({
      action: 'integration.audit.bounded-context',
      resourceType: 'platform.employee',
      result: 'success',
      traceId: 't'.repeat(256),
      ip: 'i'.repeat(256),
    });
    const boundedAuditLog = await pool.query<{ trace_id: string; ip: string }>(
      `
        SELECT trace_id, ip
        FROM platform.audit_logs
        WHERE action = 'integration.audit.bounded-context'
        ORDER BY created_at DESC
        LIMIT 1
      `,
    );
    expect(boundedAuditLog.rows[0].trace_id).toHaveLength(128);
    expect(boundedAuditLog.rows[0].ip).toHaveLength(128);
  });

  it('lists menus allowed by permission codes', async () => {
    await expect(repository.listMenusByPermissionCodes(['platform:org:view'])).resolves.toEqual([
      expect.objectContaining({
        title: '组织架构',
        permissionCode: 'platform:org:view',
      }),
    ]);
  });

  it('lists active module manifests', async () => {
    await expect(repository.listActiveModuleManifests()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'platform',
          apiPrefix: '/api/platform',
          permissions: expect.arrayContaining([
            expect.objectContaining({
              code: 'platform:permission:view',
            }),
          ]),
        }),
        expect.objectContaining({
          moduleName: 'presence',
          apiPrefix: '/api/presence',
          menus: expect.arrayContaining([
            expect.objectContaining({
              path: '/presence/board',
            }),
          ]),
        }),
      ]),
    );
  });

  it('reads and updates local identity security state', async () => {
    await repository.updateLocalIdentitySecurityState(DEFAULT_ADMIN_USER_ID, {
      failedAttempts: 0,
      lockedUntil: null,
    });
    const identity = await repository.findLocalIdentityByAccount('admin');
    expect(identity).toEqual(
      expect.objectContaining({
        userId: DEFAULT_ADMIN_USER_ID,
        account: 'admin',
        failedAttempts: 0,
      }),
    );
    expect(identity?.lockedUntil).toBeUndefined();

    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const lastLoginAt = new Date(Date.now()).toISOString();
    await repository.updateLocalIdentitySecurityState(DEFAULT_ADMIN_USER_ID, {
      failedAttempts: 3,
      lockedUntil,
      lastLoginAt,
    });
    await expect(repository.findLocalIdentityByAccount('admin')).resolves.toEqual(
      expect.objectContaining({
        failedAttempts: 3,
        lockedUntil,
      }),
    );

    await repository.updateLocalIdentitySecurityState(DEFAULT_ADMIN_USER_ID, {
      failedAttempts: 0,
      lockedUntil: null,
    });
    await expect(repository.findLocalIdentityByAccount('admin')).resolves.toEqual(
      expect.objectContaining({
        failedAttempts: 0,
      }),
    );
    expect((await repository.findLocalIdentityByAccount('admin'))?.lockedUntil).toBeUndefined();
  });

  it('updates passwords and synchronizes must-change-password across identity and employee rows', async () => {
    const passwordHash = hashPassword('Resetpass1');

    await repository.updatePassword(DEFAULT_ADMIN_USER_ID, {
      passwordHash,
      mustChangePassword: true,
    });

    const identity = await repository.findLocalIdentityByAccount('admin');
    expect(identity).toEqual(
      expect.objectContaining({
        failedAttempts: 0,
        mustChangePassword: true,
      }),
    );
    expect(identity?.lockedUntil).toBeUndefined();
    expect(verifyPassword('Resetpass1', identity?.passwordHash ?? '')).toBe(true);

    await expect(repository.findEmployeeById(DEFAULT_ADMIN_USER_ID)).resolves.toEqual(
      expect.objectContaining({
        mustChangePassword: true,
      }),
    );
  });

  it('clears lockout state when updating passwords', async () => {
    await repository.updateLocalIdentitySecurityState(DEFAULT_ADMIN_USER_ID, {
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    await repository.updatePassword(DEFAULT_ADMIN_USER_ID, {
      passwordHash: hashPassword('Unlocked1'),
      mustChangePassword: false,
    });

    await expect(repository.findLocalIdentityByAccount('admin')).resolves.toEqual(
      expect.objectContaining({
        failedAttempts: 0,
        mustChangePassword: false,
      }),
    );
    expect((await repository.findLocalIdentityByAccount('admin'))?.lockedUntil).toBeUndefined();
    await expect(repository.findEmployeeById(DEFAULT_ADMIN_USER_ID)).resolves.toEqual(
      expect.objectContaining({
        mustChangePassword: false,
      }),
    );
  });

  describe('listDescendantDepartmentIds', () => {
    it('returns active descendants from the same enterprise and stops at disabled nodes', async () => {
      const suffix = Date.now().toString();
      const root = await repository.createDepartment({
        enterpriseId: DEFAULT_ENTERPRISE_ID,
        code: `TREE${suffix}`,
        name: 'Tree Root',
      });
      const child1 = await repository.createDepartment({
        enterpriseId: DEFAULT_ENTERPRISE_ID,
        parentId: root.id,
        code: `TREE${suffix}C1`,
        name: 'Tree Child 1',
      });
      const grandchild1 = await repository.createDepartment({
        enterpriseId: DEFAULT_ENTERPRISE_ID,
        parentId: child1.id,
        code: `TREE${suffix}G1`,
        name: 'Tree Grandchild 1',
      });
      const child2 = await repository.createDepartment({
        enterpriseId: DEFAULT_ENTERPRISE_ID,
        parentId: root.id,
        code: `TREE${suffix}C2`,
        name: 'Tree Child 2',
      });
      const disabled = await repository.createDepartment({
        enterpriseId: DEFAULT_ENTERPRISE_ID,
        parentId: root.id,
        code: `TREE${suffix}D`,
        name: 'Tree Disabled',
      });
      await pool.query('UPDATE platform.departments SET status = $2 WHERE id = $1', [disabled.id, 'disabled']);
      const disabledChild = await repository.createDepartment({
        enterpriseId: DEFAULT_ENTERPRISE_ID,
        parentId: disabled.id,
        code: `TREE${suffix}DC`,
        name: 'Tree Disabled Child',
      });
      const enterprise2 = await pool.query<{ id: string }>(
        `
          INSERT INTO platform.enterprises (code, name, status)
          VALUES ($1, $2, 'active')
          RETURNING id
        `,
        [`TREE${suffix}E2`, 'Tree Enterprise 2'],
      );
      const otherDepartment = await pool.query<{ id: string }>(
        `
          INSERT INTO platform.departments (enterprise_id, parent_id, code, name, status)
          VALUES ($1, $2, $3, $4, 'active')
          RETURNING id
        `,
        [enterprise2.rows[0].id, root.id, `TREE${suffix}O`, 'Tree Other'],
      );

      const descendantIds = await repository.listDescendantDepartmentIds(root.id, DEFAULT_ENTERPRISE_ID);

      expect(descendantIds).toEqual(expect.arrayContaining([child1.id, child2.id, grandchild1.id]));
      expect(descendantIds).toHaveLength(3);
      expect(descendantIds).not.toContain(root.id);
      expect(descendantIds).not.toContain(disabled.id);
      expect(descendantIds).not.toContain(disabledChild.id);
      expect(descendantIds).not.toContain(otherDepartment.rows[0].id);
      await expect(repository.listDescendantDepartmentIds('00000000-0000-0000-0000-00000000ffff', DEFAULT_ENTERPRISE_ID)).resolves.toEqual([]);
    });
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
        dataScopes: [{ dataType: 'profile', scope: 'self' }],
        permissionCodes: ['platform:missing:permission'],
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_REFERENCE_NOT_FOUND',
      status: 400,
    });

    const roles = await repository.listRoles(DEFAULT_ENTERPRISE_ID);
    expect(roles.some((role) => role.code === roleCode)).toBe(false);
  });

  it('maps invalid role assignments to platform reference errors', async () => {
    await expect(
      repository.setUserRoles(DEFAULT_ADMIN_USER_ID, ['00000000-0000-0000-0000-00000000ffff'], DEFAULT_ENTERPRISE_ID),
    ).rejects.toMatchObject({
      code: 'PLATFORM_REFERENCE_NOT_FOUND',
      status: 400,
    });
  });

  it('rejects cross-tenant employee departments and role assignments defensively', async () => {
    const suffix = Date.now().toString();
    const enterprise = await pool.query<{ id: string }>(
      `
        INSERT INTO platform.enterprises (code, name, status)
        VALUES ($1, $2, 'active')
        RETURNING id
      `,
      [`security-${suffix}`, 'Security Tenant'],
    );
    const foreignEnterpriseId = enterprise.rows[0].id;
    const foreignDepartment = await repository.createDepartment({
      enterpriseId: foreignEnterpriseId,
      code: `SEC${suffix}`,
      name: 'Security Department',
    });
    const foreignRole = await repository.createRole({
      enterpriseId: foreignEnterpriseId,
      code: `security-role-${suffix}`,
      name: 'Security Role',
      permissionCodes: [],
      dataScopes: [],
    });
    const foreignEmployee = await repository.createEmployee({
      enterpriseId: foreignEnterpriseId,
      departmentId: foreignDepartment.id,
      employeeNo: `SEC${suffix}`,
      account: `security-user-${suffix}`,
      name: 'Security User',
      initialPassword: 'Passw0rd1',
    });

    await expect(repository.createEmployee({
      enterpriseId: DEFAULT_ENTERPRISE_ID,
      departmentId: foreignDepartment.id,
      employeeNo: `BAD${suffix}`,
      account: `security-department-${suffix}`,
      name: 'Cross Tenant Department',
      initialPassword: 'Passw0rd1',
    })).rejects.toMatchObject({
      code: 'PLATFORM_REFERENCE_NOT_FOUND',
      status: 400,
    });
    await expect(repository.setUserRoles(DEFAULT_ADMIN_USER_ID, [foreignRole.id], DEFAULT_ENTERPRISE_ID)).rejects.toMatchObject({
      code: 'PLATFORM_REFERENCE_NOT_FOUND',
      status: 400,
    });
    await expect(repository.setUserRoles(foreignEmployee.id, [DEFAULT_ADMIN_ROLE_ID], DEFAULT_ENTERPRISE_ID)).resolves.toBeUndefined();
    await expect(repository.findEmployeeById(foreignEmployee.id)).resolves.toEqual(
      expect.objectContaining({ roleIds: [] }),
    );
  });

  it('updates, counts assignments for, and physically deletes roles', async () => {
    const suffix = Date.now().toString();
    const role = await repository.createRole({
      enterpriseId: DEFAULT_ENTERPRISE_ID,
      code: `mutable-role-${suffix}`,
      name: 'Mutable Role',
      permissionCodes: ['platform:org:view'],
      dataScopes: [{ dataType: 'profile', scope: 'self' }],
    });
    const employee = await repository.createEmployee({
      enterpriseId: DEFAULT_ENTERPRISE_ID,
      departmentId: DEFAULT_DEPARTMENT_ID,
      employeeNo: `MR${suffix}`,
      account: `mutable-role-user-${suffix}`,
      name: 'Mutable Role User',
      initialPassword: 'Passw0rd1',
    });
    await repository.setUserRoles(employee.id, [role.id], DEFAULT_ENTERPRISE_ID);

    await expect(repository.countUsersWithRole(role.id)).resolves.toBe(1);
    await expect(repository.listRoles('00000000-0000-0000-0000-00000000ffff')).resolves.not.toContainEqual(
      expect.objectContaining({ id: role.id }),
    );
    await expect(repository.updateRole(role.id, { name: 'Cross Tenant Update' }, '00000000-0000-0000-0000-00000000ffff'))
      .resolves.toBeUndefined();
    await expect(repository.deleteRole(role.id, '00000000-0000-0000-0000-00000000ffff')).resolves.toBe(false);
    await expect(repository.updateRole(role.id, {
      name: 'Updated Mutable Role',
      status: 'disabled',
      permissionCodes: ['platform:employee:view'],
      dataScopes: [{ dataType: 'presence', scope: 'department_tree' }],
    }, DEFAULT_ENTERPRISE_ID)).resolves.toEqual(
      expect.objectContaining({
        id: role.id,
        name: 'Updated Mutable Role',
        status: 'disabled',
        permissionCodes: ['platform:employee:view'],
        dataScopes: [{ dataType: 'presence', scope: 'department_tree' }],
      }),
    );

    await repository.setUserRoles(employee.id, [], DEFAULT_ENTERPRISE_ID);
    await expect(repository.countUsersWithRole(role.id)).resolves.toBe(0);
    await expect(repository.deleteRole(role.id, DEFAULT_ENTERPRISE_ID)).resolves.toBe(true);
    await expect(repository.findRoleById(role.id)).resolves.toBeUndefined();
    await expect(pool.query('SELECT id FROM platform.roles WHERE id = $1', [role.id])).resolves.toMatchObject({
      rowCount: 0,
    });
  });
});
