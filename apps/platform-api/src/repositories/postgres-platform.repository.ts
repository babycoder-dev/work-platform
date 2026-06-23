import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '@work/errors';
import type {
  CreateAuditLogInput,
  CreateDepartmentInput,
  CreateEmployeeInput,
  CreateRoleInput,
  DepartmentDto,
  EmployeeDto,
  EmployeeStatus,
  EnterpriseDto,
  MenuDto,
  ModuleManifestDto,
  PermissionDto,
  RoleDataScope,
  RoleDto,
  StatusLogDto,
  UpdateDepartmentInput,
  UpdateRoleInput,
} from '@work/platform-contract';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { PLATFORM_DB_POOL } from '../db/db.provider';
import { hashAccessToken, hashPassword } from '../security/secret-hash';
import type {
  AccessSession,
  CreateAccessSessionInput,
  LocalIdentitySecurityState,
  PlatformRepository,
  NewStatusLog,
  UpdateLocalIdentitySecurityStateInput,
  UpdatePasswordInput,
} from './platform.repository';
import { mapPostgresError } from './postgres-error.mapper';

type QueryExecutor = Pick<Pool, 'query'> | PoolClient;

async function lockDepartmentReference(
  client: PoolClient,
  enterpriseId: string,
  departmentId: string,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
    'platform.department',
    `${enterpriseId}:${departmentId}`,
  ]);
}

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
  is_system: boolean;
  status: RoleDto['status'];
  permission_codes: string[];
  data_scopes: RoleDataScope[];
}

interface StatusLogRow {
  id: string;
  enterprise_id: string;
  subject_employee_id: string;
  author_employee_id: string;
  content: string;
  created_at: Date;
}

interface StatusLogListRow {
  id: string | null;
  enterprise_id: string | null;
  subject_employee_id: string | null;
  author_employee_id: string | null;
  content: string | null;
  created_at: Date | null;
  total_count: string;
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

  async listDepartments(enterpriseId: string): Promise<DepartmentDto[]> {
    const result = await this.pool.query<DepartmentRow>(
      `
      SELECT id, enterprise_id, parent_id, manager_user_id, code, name, sort_order, status
      FROM platform.departments
      WHERE enterprise_id = $1 AND deleted_at IS NULL
      ORDER BY sort_order, code
    `,
      [enterpriseId],
    );

    return result.rows.map(mapDepartment);
  }

  async createDepartment(input: CreateDepartmentInput): Promise<DepartmentDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (input.parentId !== undefined) {
        await lockDepartmentReference(client, input.enterpriseId, input.parentId);
        const parent = await client.query<{ id: string }>(
          `
            SELECT id
            FROM platform.departments
            WHERE id = $1 AND enterprise_id = $2 AND deleted_at IS NULL
          `,
          [input.parentId, input.enterpriseId],
        );
        if (parent.rows.length === 0) {
          throw new ApiError('PLATFORM_REFERENCE_NOT_FOUND', '关联资源不存在', { status: 400 });
        }
      }
      const result = await client.query<DepartmentRow>(
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

      await client.query('COMMIT');
      return mapDepartment(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async findDepartmentById(id: string): Promise<DepartmentDto | undefined> {
    if (!isUuid(id)) {
      return undefined;
    }
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

  async updateDepartment(
    id: string,
    input: UpdateDepartmentInput,
    enterpriseId: string,
  ): Promise<DepartmentDto | undefined> {
    const assignments: string[] = [];
    const values: unknown[] = [id, enterpriseId];

    if (Object.hasOwn(input, 'name')) {
      values.push(input.name);
      assignments.push(`name = $${values.length}`);
    }
    if (Object.hasOwn(input, 'parentId')) {
      values.push(input.parentId ?? null);
      assignments.push(`parent_id = $${values.length}`);
    }
    if (Object.hasOwn(input, 'managerUserId')) {
      values.push(input.managerUserId ?? null);
      assignments.push(`manager_user_id = $${values.length}`);
    }
    if (Object.hasOwn(input, 'sortOrder')) {
      values.push(input.sortOrder);
      assignments.push(`sort_order = $${values.length}`);
    }

    if (assignments.length === 0) {
      const current = await this.findDepartmentById(id);
      return current?.enterpriseId === enterpriseId ? current : undefined;
    }

    try {
      const result = await this.pool.query<DepartmentRow>(
        `
          UPDATE platform.departments
          SET ${assignments.join(', ')}, updated_at = now()
          WHERE id = $1 AND enterprise_id = $2 AND deleted_at IS NULL
          RETURNING id, enterprise_id, parent_id, manager_user_id, code, name, sort_order, status
        `,
        values,
      );

      return mapFirst(result, mapDepartment);
    } catch (error) {
      mapPostgresError(error);
    }
  }

  async softDeleteDepartment(id: string, enterpriseId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockDepartmentReference(client, enterpriseId, id);
      const result = await client.query(
        `
          UPDATE platform.departments d
          SET deleted_at = now(), updated_at = now()
          WHERE d.id = $1
            AND d.enterprise_id = $2
            AND d.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM platform.employees e
              WHERE e.department_id = d.id
                AND e.enterprise_id = d.enterprise_id
                AND e.status = 'active'
                AND e.deleted_at IS NULL
            )
            AND NOT EXISTS (
              SELECT 1
              FROM platform.departments child
              WHERE child.parent_id = d.id
                AND child.enterprise_id = d.enterprise_id
                AND child.deleted_at IS NULL
            )
        `,
        [id, enterpriseId],
      );
      await client.query('COMMIT');
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async countActiveEmployeesInDepartment(
    departmentId: string,
    enterpriseId: string,
  ): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
        FROM platform.employees
        WHERE department_id = $1
          AND enterprise_id = $2
          AND status = 'active'
          AND deleted_at IS NULL
      `,
      [departmentId, enterpriseId],
    );
    return Number(result.rows[0].count);
  }

  async hasActiveChildDepartments(parentId: string, enterpriseId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: number }>(
      `
        SELECT 1 AS exists
        FROM platform.departments
        WHERE parent_id = $1
          AND enterprise_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [parentId, enterpriseId],
    );
    return result.rows.length > 0;
  }

  async listDescendantDepartmentIds(
    parentDepartmentId: string,
    enterpriseId: string,
  ): Promise<string[]> {
    try {
      const result = await this.pool.query<{ id: string }>(
        `
          WITH RECURSIVE descendants AS (
            SELECT id, parent_id
            FROM platform.departments
            WHERE parent_id = $1
              AND enterprise_id = $2
              AND status = 'active'
            UNION ALL
            SELECT d.id, d.parent_id
            FROM platform.departments d
            INNER JOIN descendants r ON d.parent_id = r.id
            WHERE d.enterprise_id = $2
              AND d.status = 'active'
          )
          SELECT id FROM descendants
        `,
        [parentDepartmentId, enterpriseId],
      );
      return result.rows.map((row) => row.id);
    } catch (error) {
      mapPostgresError(error);
      return [];
    }
  }

  async listDescendantDepartmentIdsForCycleCheck(
    parentDepartmentId: string,
    enterpriseId: string,
  ): Promise<string[]> {
    try {
      const result = await this.pool.query<{ id: string }>(
        `
          WITH RECURSIVE descendants AS (
            SELECT id, parent_id
            FROM platform.departments
            WHERE parent_id = $1
              AND enterprise_id = $2
              AND deleted_at IS NULL
            UNION ALL
            SELECT d.id, d.parent_id
            FROM platform.departments d
            INNER JOIN descendants r ON d.parent_id = r.id
            WHERE d.enterprise_id = $2
              AND d.deleted_at IS NULL
          )
          SELECT id FROM descendants
        `,
        [parentDepartmentId, enterpriseId],
      );
      return result.rows.map((row) => row.id);
    } catch (error) {
      mapPostgresError(error);
      return [];
    }
  }

  async listEmployees(): Promise<EmployeeDto[]> {
    const result = await this.pool.query<EmployeeRow>(
      employeeSelectSql('WHERE e.deleted_at IS NULL ORDER BY e.employee_no'),
    );

    return result.rows.map(mapEmployee);
  }

  async createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (input.departmentId !== undefined) {
        await lockDepartmentReference(client, input.enterpriseId, input.departmentId);
        const department = await client.query<{ id: string }>(
          `
            SELECT id
            FROM platform.departments
            WHERE id = $1 AND enterprise_id = $2 AND deleted_at IS NULL
          `,
          [input.departmentId, input.enterpriseId],
        );
        if (department.rows.length === 0) {
          throw new ApiError('PLATFORM_REFERENCE_NOT_FOUND', '关联资源不存在', { status: 400 });
        }
      }
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

      await client.query('COMMIT');

      return {
        ...employee,
        roleIds: [],
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

  async findEmployeesByIds(ids: string[]): Promise<EmployeeDto[]> {
    const validIds = ids.filter((id) => isUuid(id));
    if (validIds.length === 0) {
      return [];
    }

    const result = await this.pool.query<EmployeeRow>(
      employeeSelectSql('WHERE e.id = ANY($1::uuid[]) AND e.deleted_at IS NULL'),
      [validIds],
    );

    return result.rows.map(mapEmployee);
  }

  async findLocalIdentityByAccount(
    account: string,
  ): Promise<LocalIdentitySecurityState | undefined> {
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

  async updatePassword(
    userId: string,
    input: UpdatePasswordInput,
    enterpriseId?: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const employee = await findEmployeeById(client, userId);
      if (!employee || (enterpriseId !== undefined && employee.enterpriseId !== enterpriseId)) {
        await client.query('ROLLBACK');
        return false;
      }
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
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async updateEmployee(
    employee: EmployeeDto,
    enterpriseId?: string,
  ): Promise<EmployeeDto | undefined> {
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
          WHERE id = $1
            AND ($11::uuid IS NULL OR enterprise_id = $11)
            AND deleted_at IS NULL
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
          enterpriseId ?? null,
        ],
      );

      return mapFirst(result, mapEmployee);
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

  async listRoles(enterpriseId: string): Promise<RoleDto[]> {
    const result = await this.pool.query<RoleRow>(
      roleSelectSql('WHERE r.enterprise_id = $1 AND r.deleted_at IS NULL ORDER BY r.code'),
      [enterpriseId],
    );

    return result.rows.map(mapRole);
  }

  async findRoleById(id: string): Promise<RoleDto | undefined> {
    return findRoleById(this.pool, id);
  }

  async createRole(input: CreateRoleInput): Promise<RoleDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<RoleRow>(
        `
          INSERT INTO platform.roles (enterprise_id, code, name, description, status)
          VALUES ($1, $2, $3, $4, 'active')
          RETURNING
            id,
            enterprise_id,
            code,
            name,
            description,
            is_system,
            status,
            ARRAY[]::text[] AS permission_codes,
            ARRAY[]::json[] AS data_scopes
        `,
        [input.enterpriseId, input.code, input.name, input.description ?? null],
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
      for (const dataScope of input.dataScopes) {
        await client.query(
          `
            INSERT INTO platform.role_data_scopes (role_id, data_type, scope)
            VALUES ($1, $2, $3)
          `,
          [role.id, dataScope.dataType, dataScope.scope],
        );
      }
      await client.query('COMMIT');

      return {
        ...role,
        permissionCodes: input.permissionCodes,
        dataScopes: input.dataScopes,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async updateRole(
    id: string,
    input: UpdateRoleInput,
    enterpriseId: string,
  ): Promise<RoleDto | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existingRole = await findRoleById(client, id);
      if (!existingRole || existingRole.enterpriseId !== enterpriseId) {
        await client.query('ROLLBACK');
        return undefined;
      }

      await client.query(
        `
          UPDATE platform.roles
          SET
            name = COALESCE($2, name),
            description = CASE WHEN $3::boolean THEN $4 ELSE description END,
            status = COALESCE($5, status),
            updated_at = now()
          WHERE id = $1 AND enterprise_id = $6 AND deleted_at IS NULL
        `,
        [
          id,
          input.name ?? null,
          input.description !== undefined,
          input.description ?? null,
          input.status ?? null,
          enterpriseId,
        ],
      );
      if (input.permissionCodes !== undefined) {
        await replaceRolePermissions(client, id, input.permissionCodes);
      }
      if (input.dataScopes !== undefined) {
        await replaceRoleDataScopes(client, id, input.dataScopes);
      }
      await client.query('COMMIT');

      return findRoleById(this.pool, id);
    } catch (error) {
      await client.query('ROLLBACK');
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async deleteRole(id: string, enterpriseId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'DELETE FROM platform.roles WHERE id = $1 AND enterprise_id = $2',
        [id, enterpriseId],
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      mapPostgresError(error);
    }
  }

  async countUsersWithRole(roleId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM platform.user_roles WHERE role_id = $1',
      [roleId],
    );
    return Number(result.rows[0].count);
  }

  async setUserRoles(
    userId: string,
    roleIds: string[],
    enterpriseId: string,
  ): Promise<EmployeeDto | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const employee = await findEmployeeById(client, userId);
      if (!employee || employee.enterpriseId !== enterpriseId) {
        await client.query('ROLLBACK');
        return undefined;
      }
      const visibleRoleIds = new Set(
        (await listRolesByEnterpriseId(client, enterpriseId)).map((role) => role.id),
      );
      if (roleIds.some((roleId) => !visibleRoleIds.has(roleId))) {
        throw new ApiError('PLATFORM_REFERENCE_NOT_FOUND', '关联资源不存在', { status: 400 });
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

  async createStatusLogs(inputs: NewStatusLog[]): Promise<StatusLogDto[]> {
    if (inputs.length === 0) {
      return [];
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const values: unknown[] = [];
      const placeholders = inputs.map((input, index) => {
        const base = index * 6;
        values.push(
          input.id,
          input.enterpriseId,
          input.subjectEmployeeId,
          input.authorEmployeeId,
          input.content,
          input.createdAt,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
      });
      const result = await client.query<StatusLogRow>(
        `
          INSERT INTO platform.status_logs (
            id,
            enterprise_id,
            subject_employee_id,
            author_employee_id,
            content,
            created_at
          )
          VALUES ${placeholders.join(', ')}
          RETURNING id, enterprise_id, subject_employee_id, author_employee_id, content, created_at
        `,
        values,
      );
      await client.query('COMMIT');
      return result.rows.map(mapStatusLog);
    } catch (error) {
      await client.query('ROLLBACK');
      mapPostgresError(error);
    } finally {
      client.release();
    }
  }

  async listStatusLogsBySubject(
    enterpriseId: string,
    subjectEmployeeId: string,
    options: { limit: number; offset: number },
  ): Promise<{ items: StatusLogDto[]; total: number }> {
    const result = await this.pool.query<StatusLogListRow>(
      `
        WITH filtered AS (
          SELECT id, enterprise_id, subject_employee_id, author_employee_id, content, created_at
          FROM platform.status_logs
          WHERE enterprise_id = $1
            AND subject_employee_id = $2
            AND deleted_at IS NULL
        ),
        total AS (
          SELECT count(*)::text AS total_count FROM filtered
        ),
        paged AS (
          SELECT *
          FROM filtered
          ORDER BY created_at DESC, id DESC
          LIMIT $3 OFFSET $4
        )
        SELECT
          paged.id,
          paged.enterprise_id,
          paged.subject_employee_id,
          paged.author_employee_id,
          paged.content,
          paged.created_at,
          total.total_count
        FROM total
        LEFT JOIN paged ON true
        ORDER BY paged.created_at DESC NULLS LAST, paged.id DESC NULLS LAST
      `,
      [enterpriseId, subjectEmployeeId, options.limit, options.offset],
    );

    return {
      items: result.rows.map(mapStatusLogListRow).filter((item): item is StatusLogDto => !!item),
      total: Number(result.rows[0]?.total_count ?? '0'),
    };
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
        limitVarchar(input.resourceId, 128),
        limitVarchar(input.traceId, 128),
        limitVarchar(input.ip, 128),
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

async function findEmployeeById(
  executor: QueryExecutor,
  id: string,
): Promise<EmployeeDto | undefined> {
  if (!isUuid(id)) {
    return undefined;
  }
  const result = await executor.query<EmployeeRow>(
    employeeSelectSql('WHERE e.id = $1 AND e.deleted_at IS NULL'),
    [id],
  );

  return mapFirst(result, mapEmployee);
}

async function findRoleById(executor: QueryExecutor, id: string): Promise<RoleDto | undefined> {
  if (!isUuid(id)) {
    return undefined;
  }
  const result = await executor.query<RoleRow>(
    roleSelectSql('WHERE r.id = $1 AND r.deleted_at IS NULL'),
    [id],
  );

  return mapFirst(result, mapRole);
}

async function listRolesByEnterpriseId(
  executor: QueryExecutor,
  enterpriseId: string,
): Promise<RoleDto[]> {
  const result = await executor.query<RoleRow>(
    roleSelectSql('WHERE r.enterprise_id = $1 AND r.deleted_at IS NULL ORDER BY r.code'),
    [enterpriseId],
  );

  return result.rows.map(mapRole);
}

function roleSelectSql(suffix: string): string {
  return `
    SELECT
      r.id,
      r.enterprise_id,
      r.code,
      r.name,
      r.description,
      r.is_system,
      r.status,
      COALESCE((
        SELECT array_agg(rp.permission_code ORDER BY rp.permission_code)
        FROM platform.role_permissions rp
        WHERE rp.role_id = r.id
      ), ARRAY[]::text[]) AS permission_codes,
      COALESCE((
        SELECT json_agg(json_build_object('dataType', rds.data_type, 'scope', rds.scope) ORDER BY rds.data_type)
        FROM platform.role_data_scopes rds
        WHERE rds.role_id = r.id
      ), '[]'::json) AS data_scopes
    FROM platform.roles r
    ${suffix}
  `;
}

async function replaceUserRoles(
  executor: QueryExecutor,
  userId: string,
  roleIds: string[],
): Promise<void> {
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

async function replaceRolePermissions(
  executor: QueryExecutor,
  roleId: string,
  permissionCodes: string[],
): Promise<void> {
  await executor.query('DELETE FROM platform.role_permissions WHERE role_id = $1', [roleId]);
  for (const permissionCode of permissionCodes) {
    await executor.query(
      `
        INSERT INTO platform.role_permissions (role_id, permission_code)
        VALUES ($1, $2)
        ON CONFLICT (role_id, permission_code) DO NOTHING
      `,
      [roleId, permissionCode],
    );
  }
}

async function replaceRoleDataScopes(
  executor: QueryExecutor,
  roleId: string,
  dataScopes: RoleDataScope[],
): Promise<void> {
  await executor.query('DELETE FROM platform.role_data_scopes WHERE role_id = $1', [roleId]);
  for (const dataScope of dataScopes) {
    await executor.query(
      `
        INSERT INTO platform.role_data_scopes (role_id, data_type, scope)
        VALUES ($1, $2, $3)
      `,
      [roleId, dataScope.dataType, dataScope.scope],
    );
  }
}

function mapFirst<Row extends QueryResultRow, Dto>(
  result: QueryResult<Row>,
  mapper: (row: Row) => Dto,
): Dto | undefined {
  const row = result.rows[0];
  return row ? mapper(row) : undefined;
}

function limitVarchar(value: string | undefined, maxLength: number): string | null {
  return value?.slice(0, maxLength) ?? null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

function asModuleManifestPayload(
  value: unknown,
): Omit<ModuleManifestDto, 'id' | 'moduleName' | 'status'> {
  const payload = value && typeof value === 'object' ? (value as Partial<ModuleManifestDto>) : {};

  return {
    displayName: typeof payload.displayName === 'string' ? payload.displayName : '',
    description: typeof payload.description === 'string' ? payload.description : undefined,
    apiPrefix: typeof payload.apiPrefix === 'string' ? payload.apiPrefix : '',
    webEntry: typeof payload.webEntry === 'string' ? payload.webEntry : undefined,
    permissions: Array.isArray(payload.permissions) ? (payload.permissions as PermissionDto[]) : [],
    menus: Array.isArray(payload.menus) ? (payload.menus as MenuDto[]) : [],
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
    dataScopes: row.data_scopes ?? [],
    isSystem: row.is_system,
    status: row.status,
  };
}

function mapStatusLog(row: StatusLogRow): StatusLogDto {
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    subjectEmployeeId: row.subject_employee_id,
    authorEmployeeId: row.author_employee_id,
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}

function mapStatusLogListRow(row: StatusLogListRow): StatusLogDto | undefined {
  if (
    !row.id ||
    !row.enterprise_id ||
    !row.subject_employee_id ||
    !row.author_employee_id ||
    row.content === null ||
    !row.created_at
  ) {
    return undefined;
  }

  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    subjectEmployeeId: row.subject_employee_id,
    authorEmployeeId: row.author_employee_id,
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}
