import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateAuditLogInput,
  CreateDepartmentInput,
  CreateEmployeeInput,
  CreateRoleInput,
  DataScope,
  DepartmentDto,
  EmployeeDto,
  EmployeeStatus,
  EnterpriseDto,
  MenuDto,
  ModuleManifestDto,
  PermissionDto,
  RoleDto,
} from '@work/platform-contract';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { PLATFORM_DB_POOL } from '../db/db.provider';
import { hashAccessToken, hashPassword } from '../security/secret-hash';
import type {
  AccessSession,
  CreateAccessSessionInput,
  LocalIdentitySecurityState,
  PlatformRepository,
  UpdateLocalIdentitySecurityStateInput,
  UpdatePasswordInput,
} from './platform.repository';
import { mapPostgresError } from './postgres-error.mapper';

type QueryExecutor = Pick<Pool, 'query'> | PoolClient;

interface EnterpriseRow {
  id: string;
  code: string;
  name: string;
  status: EnterpriseDto['status'];
}

interface DepartmentRow {
  id: string;
  enterprise_id: string;
  parent_id: string | null;
  manager_user_id: string | null;
  code: string;
  name: string;
  sort_order: number;
  status: DepartmentDto['status'];
}

interface EmployeeRow {
  id: string;
  enterprise_id: string;
  department_id: string | null;
  employee_no: string;
  account: string;
  name: string;
  title: string | null;
  mobile: string | null;
  email: string | null;
  status: EmployeeStatus;
  must_change_password: boolean;
  role_ids: string[];
}

interface LocalIdentitySecurityRow {
  user_id: string;
  account: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | null;
  must_change_password: boolean;
}

interface PermissionRow {
  code: string;
  name: string;
  module_name: string;
  description: string | null;
}

interface MenuRow {
  id: string;
  module_name: string;
  parent_id: string | null;
  title: string;
  path: string;
  permission_code: string | null;
  sort_order: number;
  status: MenuDto['status'];
}

interface ModuleManifestRow {
  id: string;
  module_name: string;
  manifest: unknown;
  status: ModuleManifestDto['status'];
}

interface RoleRow {
  id: string;
  enterprise_id: string;
  code: string;
  name: string;
  description: string | null;
  data_scope: DataScope;
  status: RoleDto['status'];
  permission_codes: string[];
}

@Injectable()
export class PostgresPlatformRepository implements PlatformRepository {
  constructor(@Inject(PLATFORM_DB_POOL) private readonly pool: Pool) {}

  async listEnterprises(): Promise<EnterpriseDto[]> {
    const result = await this.pool.query<EnterpriseRow>(
      'SELECT id, code, name, status FROM platform.enterprises ORDER BY code',
    );

    return result.rows.map(mapEnterprise);
  }

  async listDepartments(): Promise<DepartmentDto[]> {
    const result = await this.pool.query<DepartmentRow>(`
      SELECT id, enterprise_id, parent_id, manager_user_id, code, name, sort_order, status
      FROM platform.departments
      WHERE deleted_at IS NULL
      ORDER BY sort_order, code
    `);

    return result.rows.map(mapDepartment);
  }

  async createDepartment(input: CreateDepartmentInput): Promise<DepartmentDto> {
    try {
      const result = await this.pool.query<DepartmentRow>(
        `
          INSERT INTO platform.departments (
            enterprise_id,
            parent_id,
            manager_user_id,
            code,
            name,
            sort_order,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'active')
          RETURNING id, enterprise_id, parent_id, manager_user_id, code, name, sort_order, status
        `,
        [
          input.enterpriseId,
          input.parentId ?? null,
          input.managerUserId ?? null,
          input.code,
          input.name,
          input.sortOrder ?? 100,
        ],
      );

      return mapDepartment(result.rows[0]);
    } catch (error) {
      mapPostgresError(error);
    }
  }

  async findDepartmentById(id: string): Promise<DepartmentDto | undefined> {
    const result = await this.pool.query<DepartmentRow>(
      `
        SELECT id, enterprise_id, parent_id, manager_user_id, code, name, sort_order, status
        FROM platform.departments
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [id],
    );

    return mapFirst(result, mapDepartment);
  }

  async listEmployees(): Promise<EmployeeDto[]> {
    const result = await this.pool.query<EmployeeRow>(employeeSelectSql('WHERE e.deleted_at IS NULL ORDER BY e.employee_no'));

    return result.rows.map(mapEmployee);
  }

  async createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const employeeResult = await client.query<EmployeeRow>(
        `
          INSERT INTO platform.employees (
            enterprise_id,
            department_id,
            employee_no,
            account,
            name,
            title,
            mobile,
            email,
            status,
            must_change_password
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', true)
          RETURNING
            id,
            enterprise_id,
            department_id,
            employee_no,
            account,
            name,
            title,
            mobile,
            email,
            status,
            must_change_password,
            ARRAY[]::uuid[]::text[] AS role_ids
        `,
        [
          input.enterpriseId,
          input.departmentId ?? null,
          input.employeeNo,
          input.account,
          input.name,
          input.title ?? null,
          input.mobile ?? null,
          input.email ?? null,
        ],
      );
      const employee = mapEmployee(employeeResult.rows[0]);

      await client.query(
        `
          INSERT INTO platform.local_identities (user_id, account, password_hash, must_change_password)
          VALUES ($1, $2, $3, true)
        `,
        [employee.id, input.account, hashPassword(input.initialPassword)],
      );

      await replaceUserRoles(client, employee.id, input.roleIds ?? []);
      await client.query('COMMIT');

      return {
        ...employee,
        roleIds: input.roleIds ?? [],
      };
    } catch (error) {
      await client.query('ROLLBACK');
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async findEmployeeById(id: string): Promise<EmployeeDto | undefined> {
    return findEmployeeById(this.pool, id);
  }

  async findLocalIdentityByAccount(account: string): Promise<LocalIdentitySecurityState | undefined> {
    const result = await this.pool.query<LocalIdentitySecurityRow>(
      `
        SELECT
          li.user_id,
          li.account,
          li.password_hash,
          li.failed_attempts,
          li.locked_until,
          li.must_change_password
        FROM platform.local_identities li
        JOIN platform.employees e ON e.id = li.user_id
        WHERE li.account = $1 AND e.deleted_at IS NULL
      `,
      [account],
    );

    return mapFirst(result, mapLocalIdentitySecurityState);
  }

  async updateLocalIdentitySecurityState(
    userId: string,
    input: UpdateLocalIdentitySecurityStateInput,
  ): Promise<void> {
    try {
      await this.pool.query(
        `
          UPDATE platform.local_identities
          SET
            failed_attempts = $2,
            locked_until = $3,
            last_login_at = COALESCE($4, last_login_at),
            updated_at = now()
          WHERE user_id = $1
        `,
        [userId, input.failedAttempts, input.lockedUntil, input.lastLoginAt ?? null],
      );
    } catch (error) {
      mapPostgresError(error);
    }
  }

  async updatePassword(userId: string, input: UpdatePasswordInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `
          UPDATE platform.local_identities
          SET
            password_hash = $2,
            must_change_password = $3,
            password_updated_at = now(),
            failed_attempts = 0,
            locked_until = NULL,
            updated_at = now()
          WHERE user_id = $1
        `,
        [userId, input.passwordHash, input.mustChangePassword],
      );
      await client.query(
        `
          UPDATE platform.employees
          SET
            must_change_password = $2,
            updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL
        `,
        [userId, input.mustChangePassword],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async updateEmployee(employee: EmployeeDto): Promise<EmployeeDto> {
    try {
      const result = await this.pool.query<EmployeeRow>(
        `
          UPDATE platform.employees
          SET
            department_id = $2,
            employee_no = $3,
            account = $4,
            name = $5,
            title = $6,
            mobile = $7,
            email = $8,
            status = $9,
            must_change_password = $10,
            updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING
            id,
            enterprise_id,
            department_id,
            employee_no,
            account,
            name,
            title,
            mobile,
            email,
            status,
            must_change_password,
            COALESCE((
              SELECT array_agg(ur.role_id::text ORDER BY ur.role_id::text)
              FROM platform.user_roles ur
              WHERE ur.user_id = employees.id
            ), ARRAY[]::text[]) AS role_ids
        `,
        [
          employee.id,
          employee.departmentId ?? null,
          employee.employeeNo,
          employee.account,
          employee.name,
          employee.title ?? null,
          employee.mobile ?? null,
          employee.email ?? null,
          employee.status,
          employee.mustChangePassword,
        ],
      );

      return mapEmployee(result.rows[0]);
    } catch (error) {
      mapPostgresError(error);
    }
  }

  async createAccessSession(input: CreateAccessSessionInput): Promise<AccessSession> {
    try {
      await this.pool.query(
        `
          INSERT INTO platform.sessions (user_id, access_token_hash, expires_at)
          VALUES ($1, $2, $3)
        `,
        [input.userId, hashAccessToken(input.accessToken), input.expiresAt],
      );

      return {
        accessToken: input.accessToken,
        userId: input.userId,
        expiresAt: input.expiresAt,
      };
    } catch (error) {
      mapPostgresError(error);
    }
  }

  async findAccessSession(accessToken: string): Promise<AccessSession | undefined> {
    const result = await this.pool.query<{ user_id: string; expires_at: Date }>(
      `
        SELECT user_id, expires_at
        FROM platform.sessions
        WHERE access_token_hash = $1 AND revoked_at IS NULL
      `,
      [hashAccessToken(accessToken)],
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return {
      accessToken,
      userId: row.user_id,
      expiresAt: row.expires_at.toISOString(),
    };
  }

  async listPermissions(): Promise<PermissionDto[]> {
    const result = await this.pool.query<PermissionRow>(
      'SELECT code, name, module_name, description FROM platform.permissions ORDER BY code',
    );

    return result.rows.map(mapPermission);
  }

  async findPermissionByCode(code: string): Promise<PermissionDto | undefined> {
    const result = await this.pool.query<PermissionRow>(
      'SELECT code, name, module_name, description FROM platform.permissions WHERE code = $1',
      [code],
    );

    return mapFirst(result, mapPermission);
  }

  async listMenusByPermissionCodes(permissionCodes: string[]): Promise<MenuDto[]> {
    const result = await this.pool.query<MenuRow>(
      `
        SELECT id, module_name, parent_id, title, path, permission_code, sort_order, status
        FROM platform.menus
        WHERE status = 'active'
          AND (permission_code IS NULL OR permission_code = ANY($1::varchar[]))
        ORDER BY sort_order, title
      `,
      [permissionCodes],
    );

    return result.rows.map(mapMenu);
  }

  async listActiveModuleManifests(): Promise<ModuleManifestDto[]> {
    const result = await this.pool.query<ModuleManifestRow>(
      `
        SELECT id, module_name, manifest, status
        FROM platform.module_manifests
        WHERE status = 'active'
        ORDER BY module_name
      `,
    );

    return result.rows.map(mapModuleManifest);
  }

  async listRoles(): Promise<RoleDto[]> {
    const result = await this.pool.query<RoleRow>(roleSelectSql('WHERE r.deleted_at IS NULL ORDER BY r.code'));

    return result.rows.map(mapRole);
  }

  async findRoleById(id: string): Promise<RoleDto | undefined> {
    const result = await this.pool.query<RoleRow>(roleSelectSql('WHERE r.id = $1 AND r.deleted_at IS NULL'), [id]);

    return mapFirst(result, mapRole);
  }

  async createRole(input: CreateRoleInput): Promise<RoleDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<RoleRow>(
        `
          INSERT INTO platform.roles (enterprise_id, code, name, description, data_scope, status)
          VALUES ($1, $2, $3, $4, $5, 'active')
          RETURNING
            id,
            enterprise_id,
            code,
            name,
            description,
            data_scope,
            status,
            ARRAY[]::text[] AS permission_codes
        `,
        [input.enterpriseId, input.code, input.name, input.description ?? null, input.dataScope],
      );
      const role = mapRole(result.rows[0]);

      for (const permissionCode of input.permissionCodes) {
        await client.query(
          `
            INSERT INTO platform.role_permissions (role_id, permission_code)
            VALUES ($1, $2)
            ON CONFLICT (role_id, permission_code) DO NOTHING
          `,
          [role.id, permissionCode],
        );
      }
      await client.query('COMMIT');

      return {
        ...role,
        permissionCodes: input.permissionCodes,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async setUserRoles(userId: string, roleIds: string[]): Promise<EmployeeDto | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const employee = await findEmployeeById(client, userId);
      if (!employee) {
        await client.query('ROLLBACK');
        return undefined;
      }

      await replaceUserRoles(client, userId, roleIds);
      await client.query('COMMIT');

      return {
        ...employee,
        roleIds,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async recordAuditLog(input: CreateAuditLogInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO platform.audit_logs (
          actor_user_id,
          actor_account,
          action,
          resource_type,
          resource_id,
          trace_id,
          ip,
          user_agent,
          result,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        input.actorUserId ?? null,
        input.actorAccount ?? null,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.traceId ?? null,
        input.ip ?? null,
        input.userAgent ?? null,
        input.result,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
  }
}

function employeeSelectSql(suffix: string): string {
  return `
    SELECT
      e.id,
      e.enterprise_id,
      e.department_id,
      e.employee_no,
      e.account,
      e.name,
      e.title,
      e.mobile,
      e.email,
      e.status,
      e.must_change_password,
      COALESCE((
        SELECT array_agg(ur.role_id::text ORDER BY ur.role_id::text)
        FROM platform.user_roles ur
        WHERE ur.user_id = e.id
      ), ARRAY[]::text[]) AS role_ids
    FROM platform.employees e
    ${suffix}
  `;
}

async function findEmployeeById(executor: QueryExecutor, id: string): Promise<EmployeeDto | undefined> {
  const result = await executor.query<EmployeeRow>(employeeSelectSql('WHERE e.id = $1 AND e.deleted_at IS NULL'), [id]);

  return mapFirst(result, mapEmployee);
}

function roleSelectSql(suffix: string): string {
  return `
    SELECT
      r.id,
      r.enterprise_id,
      r.code,
      r.name,
      r.description,
      r.data_scope,
      r.status,
      COALESCE((
        SELECT array_agg(rp.permission_code ORDER BY rp.permission_code)
        FROM platform.role_permissions rp
        WHERE rp.role_id = r.id
      ), ARRAY[]::text[]) AS permission_codes
    FROM platform.roles r
    ${suffix}
  `;
}

async function replaceUserRoles(executor: QueryExecutor, userId: string, roleIds: string[]): Promise<void> {
  await executor.query('DELETE FROM platform.user_roles WHERE user_id = $1', [userId]);
  for (const roleId of roleIds) {
    await executor.query(
      `
        INSERT INTO platform.user_roles (user_id, role_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, role_id) DO NOTHING
      `,
      [userId, roleId],
    );
  }
}

function mapFirst<Row extends QueryResultRow, Dto>(result: QueryResult<Row>, mapper: (row: Row) => Dto): Dto | undefined {
  const row = result.rows[0];
  return row ? mapper(row) : undefined;
}

function mapEnterprise(row: EnterpriseRow): EnterpriseDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
  };
}

function mapDepartment(row: DepartmentRow): DepartmentDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    code: row.code,
    name: row.name,
    parentId: row.parent_id ?? undefined,
    managerUserId: row.manager_user_id ?? undefined,
    sortOrder: row.sort_order,
    status: row.status,
  };
}

function mapEmployee(row: EmployeeRow): EmployeeDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    employeeNo: row.employee_no,
    account: row.account,
    name: row.name,
    departmentId: row.department_id ?? undefined,
    title: row.title ?? undefined,
    mobile: row.mobile ?? undefined,
    email: row.email ?? undefined,
    status: row.status,
    roleIds: row.role_ids ?? [],
    mustChangePassword: row.must_change_password,
  };
}

function mapLocalIdentitySecurityState(row: LocalIdentitySecurityRow): LocalIdentitySecurityState {
  return {
    userId: row.user_id,
    account: row.account,
    passwordHash: row.password_hash,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until?.toISOString(),
    mustChangePassword: row.must_change_password,
  };
}

function mapPermission(row: PermissionRow): PermissionDto {
  return {
    code: row.code,
    name: row.name,
    moduleName: row.module_name,
    description: row.description ?? undefined,
  };
}

function mapMenu(row: MenuRow): MenuDto {
  return {
    id: row.id,
    moduleName: row.module_name,
    parentId: row.parent_id ?? undefined,
    title: row.title,
    path: row.path,
    permissionCode: row.permission_code ?? undefined,
    sortOrder: row.sort_order,
    status: row.status,
  };
}

function mapModuleManifest(row: ModuleManifestRow): ModuleManifestDto {
  const manifest = asModuleManifestPayload(row.manifest);
  return {
    id: row.id,
    moduleName: row.module_name,
    displayName: manifest.displayName,
    description: manifest.description,
    apiPrefix: manifest.apiPrefix,
    webEntry: manifest.webEntry,
    permissions: manifest.permissions,
    menus: manifest.menus,
    status: row.status,
  };
}

function asModuleManifestPayload(value: unknown): Omit<ModuleManifestDto, 'id' | 'moduleName' | 'status'> {
  const payload = value && typeof value === 'object' ? value as Partial<ModuleManifestDto> : {};

  return {
    displayName: typeof payload.displayName === 'string' ? payload.displayName : '',
    description: typeof payload.description === 'string' ? payload.description : undefined,
    apiPrefix: typeof payload.apiPrefix === 'string' ? payload.apiPrefix : '',
    webEntry: typeof payload.webEntry === 'string' ? payload.webEntry : undefined,
    permissions: Array.isArray(payload.permissions) ? payload.permissions as PermissionDto[] : [],
    menus: Array.isArray(payload.menus) ? payload.menus as MenuDto[] : [],
  };
}

function mapRole(row: RoleRow): RoleDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    code: row.code,
    name: row.name,
    description: row.description ?? undefined,
    permissionCodes: row.permission_codes ?? [],
    dataScope: row.data_scope,
    status: row.status,
  };
}
