import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { readPlatformDatabaseConfig } from '../db/db.config';
import { hashPassword } from '../security/secret-hash';
import { readPlatformBootstrapConfig } from './bootstrap.config';
import {
  DEFAULT_ADMIN_ROLE_ID,
  DEFAULT_ADMIN_USER_ID,
  DEFAULT_DEPARTMENT_ID,
  DEFAULT_ENTERPRISE_ID,
  platformSeedPermissions,
} from './seed-data';

export interface SeedPlatformResult {
  adminPasswordUpdated: boolean;
  adminRoleId: string;
  adminUserId: string;
  departmentId: string;
  enterpriseId: string;
  permissionCount: number;
}

const modulePath = fileURLToPath(import.meta.url);

export async function seedPlatform(): Promise<SeedPlatformResult> {
  const databaseConfig = readPlatformDatabaseConfig();
  const bootstrapConfig = readPlatformBootstrapConfig();
  const client = new Client({
    connectionString: databaseConfig.databaseUrl,
    ssl: databaseConfig.ssl ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    try {
      const enterpriseId = await upsertEnterprise(client, bootstrapConfig.enterpriseCode, bootstrapConfig.enterpriseName);
      const departmentId = await upsertRootDepartment(client, enterpriseId);
      await upsertPermissions(client);
      const adminRoleId = await upsertAdminRole(client, enterpriseId);
      await grantRolePermissions(client, adminRoleId);
      const adminUserId = await upsertAdminEmployee(client, {
        account: bootstrapConfig.adminAccount,
        departmentId,
        employeeNo: bootstrapConfig.adminEmployeeNo,
        enterpriseId,
        name: bootstrapConfig.adminName,
      });
      const adminPasswordUpdated = await upsertLocalIdentity(client, {
        account: bootstrapConfig.adminAccount,
        password: bootstrapConfig.adminPassword,
        resetPassword: bootstrapConfig.resetAdminPassword,
        userId: adminUserId,
      });
      await assignAdminRole(client, adminUserId, adminRoleId);
      await client.query('COMMIT');

      return {
        adminPasswordUpdated,
        adminRoleId,
        adminUserId,
        departmentId,
        enterpriseId,
        permissionCount: platformSeedPermissions.length,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

async function upsertEnterprise(client: Client, code: string, name: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO platform.enterprises (id, code, name, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (code)
      DO UPDATE SET
        name = EXCLUDED.name,
        status = 'active',
        updated_at = now()
      RETURNING id
    `,
    [DEFAULT_ENTERPRISE_ID, code, name],
  );

  return result.rows[0].id;
}

async function upsertRootDepartment(client: Client, enterpriseId: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO platform.departments (id, enterprise_id, code, name, sort_order, status)
      VALUES ($1, $2, 'HQ', '总部', 1, 'active')
      ON CONFLICT (enterprise_id, code)
      DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        status = 'active',
        deleted_at = NULL,
        updated_at = now()
      RETURNING id
    `,
    [DEFAULT_DEPARTMENT_ID, enterpriseId],
  );

  return result.rows[0].id;
}

async function upsertPermissions(client: Client): Promise<void> {
  for (const permission of platformSeedPermissions) {
    await client.query(
      `
        INSERT INTO platform.permissions (code, name, module_name, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (code)
        DO UPDATE SET
          name = EXCLUDED.name,
          module_name = EXCLUDED.module_name,
          description = EXCLUDED.description,
          updated_at = now()
      `,
      [permission.code, permission.name, permission.moduleName, permission.description ?? null],
    );
  }
}

async function upsertAdminRole(client: Client, enterpriseId: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO platform.roles (id, enterprise_id, code, name, data_scope, status)
      VALUES ($1, $2, 'admin', '系统管理员', 'company', 'active')
      ON CONFLICT (enterprise_id, code)
      DO UPDATE SET
        name = EXCLUDED.name,
        data_scope = EXCLUDED.data_scope,
        status = 'active',
        deleted_at = NULL,
        updated_at = now()
      RETURNING id
    `,
    [DEFAULT_ADMIN_ROLE_ID, enterpriseId],
  );

  return result.rows[0].id;
}

async function grantRolePermissions(client: Client, roleId: string): Promise<void> {
  for (const permission of platformSeedPermissions) {
    await client.query(
      `
        INSERT INTO platform.role_permissions (role_id, permission_code)
        VALUES ($1, $2)
        ON CONFLICT (role_id, permission_code) DO NOTHING
      `,
      [roleId, permission.code],
    );
  }
}

interface AdminEmployeeInput {
  account: string;
  departmentId: string;
  employeeNo: string;
  enterpriseId: string;
  name: string;
}

async function upsertAdminEmployee(client: Client, input: AdminEmployeeInput): Promise<string> {
  const result = await client.query<{ id: string }>(
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
      ON CONFLICT (enterprise_id, account)
      DO UPDATE SET
        department_id = EXCLUDED.department_id,
        employee_no = EXCLUDED.employee_no,
        name = EXCLUDED.name,
        status = 'active',
        deleted_at = NULL,
        updated_at = now()
      RETURNING id
    `,
    [DEFAULT_ADMIN_USER_ID, input.enterpriseId, input.departmentId, input.employeeNo, input.account, input.name],
  );

  return result.rows[0].id;
}

interface LocalIdentityInput {
  account: string;
  password: string;
  resetPassword: boolean;
  userId: string;
}

async function upsertLocalIdentity(client: Client, input: LocalIdentityInput): Promise<boolean> {
  const passwordHash = hashPassword(input.password);
  if (input.resetPassword) {
    await client.query(
      `
        INSERT INTO platform.local_identities (
          user_id,
          account,
          password_hash,
          must_change_password,
          failed_attempts,
          locked_until
        )
        VALUES ($1, $2, $3, true, 0, NULL)
        ON CONFLICT (user_id)
        DO UPDATE SET
          account = EXCLUDED.account,
          password_hash = EXCLUDED.password_hash,
          password_updated_at = now(),
          must_change_password = true,
          failed_attempts = 0,
          locked_until = NULL,
          updated_at = now()
      `,
      [input.userId, input.account, passwordHash],
    );
    return true;
  }

  const result = await client.query<{ user_id: string }>(
    `
      INSERT INTO platform.local_identities (
        user_id,
        account,
        password_hash,
        must_change_password,
        failed_attempts,
        locked_until
      )
      VALUES ($1, $2, $3, true, 0, NULL)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id
    `,
    [input.userId, input.account, passwordHash],
  );

  return result.rowCount === 1;
}

async function assignAdminRole(client: Client, userId: string, roleId: string): Promise<void> {
  await client.query(
    `
      INSERT INTO platform.user_roles (user_id, role_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, role_id) DO NOTHING
    `,
    [userId, roleId],
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  seedPlatform()
    .then((result) => {
      console.log(`Seeded platform foundation: ${JSON.stringify(result)}`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
