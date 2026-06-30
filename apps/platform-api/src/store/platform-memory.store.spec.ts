import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import { UpdateDepartmentDto } from '../org/department.dto';
import { verifyPassword } from '../security/secret-hash';
import { PlatformMemoryStore } from './platform-memory.store';

const TEST_INITIAL_SECRET = 'test-initial-secret';

describe('PlatformMemoryStore', () => {
  it('seeds the default enterprise, department, admin and permissions', async () => {
    const store = new PlatformMemoryStore();

    await expect(store.listEnterprises()).resolves.toEqual([
      expect.objectContaining({
        code: 'default',
        name: '默认企业',
      }),
    ]);
    await expect(store.listDepartments('ent-default')).resolves.toEqual([
      expect.objectContaining({
        code: 'HQ',
        name: '总部',
      }),
    ]);
    const identity = await store.findLocalIdentityByAccount('admin');
    expect(identity).toEqual(
      expect.objectContaining({
        account: 'admin',
        failedAttempts: 0,
      }),
    );
    expect(identity?.lockedUntil).toBeUndefined();
    expect(verifyPassword('admin123', identity?.passwordHash ?? '')).toBe(true);
    expect((await store.listPermissions()).length).toBeGreaterThan(0);
  });

  it('stores issued access sessions', async () => {
    const store = new PlatformMemoryStore();
    const session = await store.createAccessSession({
      accessToken: 'dev-access-test',
      userId: 'user-admin',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });

    expect(session.userId).toBe('user-admin');
    await expect(store.findAccessSession('dev-access-test')).resolves.toEqual(session);
  });

  it('creates employees and assigns roles through the repository contract', async () => {
    const store = new PlatformMemoryStore();
    const employee = await store.createEmployee({
      enterpriseId: 'ent-default',
      employeeNo: '000002',
      account: 'zhangsan',
      name: '张三',
      initialPassword: TEST_INITIAL_SECRET,
    });

    const updated = await store.setUserRoles(employee.id, ['role-admin'], 'ent-default');

    const identity = await store.findLocalIdentityByAccount('zhangsan');
    expect(updated?.roleIds).toEqual(['role-admin']);
    expect(identity?.userId).toBe(employee.id);
    expect(verifyPassword(TEST_INITIAL_SECRET, identity?.passwordHash ?? '')).toBe(true);
  });

  it('rejects employee creation with a department from another tenant', async () => {
    const store = new PlatformMemoryStore();
    const foreignDepartment = await store.createDepartment({
      enterpriseId: 'ent-other',
      code: 'OTHER',
      name: 'Other Tenant',
    });

    await expect(
      store.createEmployee({
        enterpriseId: 'ent-default',
        departmentId: foreignDepartment.id,
        employeeNo: '000099',
        account: 'cross-tenant-department',
        name: 'Cross Tenant Department',
        initialPassword: TEST_INITIAL_SECRET,
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_REFERENCE_NOT_FOUND',
      status: 400,
    });
  });

  it('soft deletes departments without changing descendant scope behavior', async () => {
    const store = new PlatformMemoryStore();
    const parent = await store.createDepartment({
      enterpriseId: 'ent-default',
      code: 'SOFT-P',
      name: 'Soft Parent',
    });
    const child = await store.createDepartment({
      enterpriseId: 'ent-default',
      parentId: parent.id,
      code: 'SOFT-C',
      name: 'Soft Child',
    });

    await expect(store.softDeleteDepartment(child.id, 'ent-other')).resolves.toBe(false);
    await expect(store.softDeleteDepartment(parent.id, 'ent-default')).resolves.toBe(false);
    await expect(store.softDeleteDepartment(child.id, 'ent-default')).resolves.toBe(true);

    await expect(store.findDepartmentById(child.id)).resolves.toBeUndefined();
    await expect(store.listDepartments('ent-default')).resolves.not.toContainEqual(
      expect.objectContaining({ id: child.id }),
    );
    await expect(store.hasActiveChildDepartments(parent.id, 'ent-default')).resolves.toBe(false);

    // Scope expansion intentionally keeps the original active-only behavior and is not used
    // for cycle checks or deletion occupancy.
    await expect(store.listDescendantDepartmentIds(parent.id, 'ent-default')).resolves.toContain(
      child.id,
    );
  });

  it('updates department fields by presence and counts active employee occupancy', async () => {
    const store = new PlatformMemoryStore();
    const department = await store.createDepartment({
      enterpriseId: 'ent-default',
      code: 'UPD',
      name: '待更新',
    });
    const manager = await store.createEmployee({
      enterpriseId: 'ent-default',
      employeeNo: '000010',
      account: 'manager',
      name: 'Manager',
      initialPassword: TEST_INITIAL_SECRET,
    });
    await store.createEmployee({
      enterpriseId: 'ent-default',
      departmentId: department.id,
      employeeNo: '000011',
      account: 'active-user',
      name: 'Active User',
      initialPassword: TEST_INITIAL_SECRET,
    });
    const disabled = await store.createEmployee({
      enterpriseId: 'ent-default',
      departmentId: department.id,
      employeeNo: '000012',
      account: 'disabled-user',
      name: 'Disabled User',
      initialPassword: TEST_INITIAL_SECRET,
    });
    await store.updateEmployee({ ...disabled, status: 'disabled' }, 'ent-default');

    await expect(
      store.updateDepartment(
        department.id,
        { name: '已更新', managerUserId: manager.id, parentId: null, sortOrder: 7 },
        'ent-default',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: department.id,
        name: '已更新',
        managerUserId: manager.id,
        parentId: undefined,
        sortOrder: 7,
      }),
    );
    await expect(
      store.updateDepartment(department.id, { name: '跨租户' }, 'ent-other'),
    ).resolves.toBeUndefined();
    await expect(
      store.countActiveEmployeesInDepartment(department.id, 'ent-default'),
    ).resolves.toBe(1);
    await expect(store.softDeleteDepartment(department.id, 'ent-default')).resolves.toBe(false);
  });

  it('preserves omitted class-transformed department fields when moving a department', async () => {
    const store = new PlatformMemoryStore();
    const parent = await store.createDepartment({
      enterpriseId: 'ent-default',
      code: 'MOVE-PARENT',
      name: '目标父部门',
    });
    const child = await store.createDepartment({
      enterpriseId: 'ent-default',
      code: 'MOVE-CHILD',
      name: '待移动部门',
    });
    const manager = await store.createEmployee({
      enterpriseId: 'ent-default',
      employeeNo: '000013',
      account: 'move-manager',
      name: 'Move Manager',
      initialPassword: TEST_INITIAL_SECRET,
    });
    await store.updateDepartment(
      child.id,
      { managerUserId: manager.id, sortOrder: 8 },
      'ent-default',
    );

    const input = plainToInstance(UpdateDepartmentDto, { parentId: parent.id });
    expect(Object.hasOwn(input, 'name')).toBe(true);
    expect(input.name).toBeUndefined();
    expect(Object.hasOwn(input, 'managerUserId')).toBe(true);
    expect(input.managerUserId).toBeUndefined();

    await expect(store.updateDepartment(child.id, input, 'ent-default')).resolves.toEqual(
      expect.objectContaining({
        id: child.id,
        name: '待移动部门',
        parentId: parent.id,
        managerUserId: manager.id,
        sortOrder: 8,
      }),
    );
  });

  it('round-trips per-type role data scopes with non-system roles by default', async () => {
    const store = new PlatformMemoryStore();
    const role = await store.createRole({
      enterpriseId: 'ent-default',
      code: 'profile-reader',
      name: 'Profile Reader',
      permissionCodes: ['platform:employee:view'],
      dataScopes: [
        { dataType: 'profile', scope: 'company' },
        { dataType: 'presence', scope: 'department' },
      ],
    });

    await expect(store.findRoleById(role.id)).resolves.toEqual({
      ...role,
      dataScopes: [
        { dataType: 'profile', scope: 'company' },
        { dataType: 'presence', scope: 'department' },
      ],
      isSystem: false,
    });
  });

  it('updates, counts assignments for, and deletes roles', async () => {
    const store = new PlatformMemoryStore();
    const role = await store.createRole({
      enterpriseId: 'ent-default',
      code: 'mutable-role',
      name: 'Mutable Role',
      permissionCodes: [],
      dataScopes: [],
    });
    const employee = await store.createEmployee({
      enterpriseId: 'ent-default',
      employeeNo: '000003',
      account: 'role-user',
      name: 'Role User',
      initialPassword: TEST_INITIAL_SECRET,
    });
    await store.setUserRoles(employee.id, [role.id], 'ent-default');

    await expect(store.countUsersWithRole(role.id)).resolves.toBe(1);
    await expect(store.listRoles('ent-other')).resolves.not.toContainEqual(
      expect.objectContaining({ id: role.id }),
    );
    await expect(
      store.updateRole(role.id, { name: 'Cross Tenant Update' }, 'ent-other'),
    ).resolves.toBeUndefined();
    await expect(store.deleteRole(role.id, 'ent-other')).resolves.toBe(false);
    await expect(
      store.updateRole(
        role.id,
        {
          name: 'Updated Role',
          status: 'disabled',
          permissionCodes: ['platform:org:view'],
          dataScopes: [{ dataType: 'report', scope: 'company' }],
        },
        'ent-default',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: role.id,
        name: 'Updated Role',
        status: 'disabled',
        permissionCodes: ['platform:org:view'],
        dataScopes: [{ dataType: 'report', scope: 'company' }],
      }),
    );

    await store.setUserRoles(employee.id, [], 'ent-default');
    await expect(store.countUsersWithRole(role.id)).resolves.toBe(0);
    await expect(store.deleteRole(role.id, 'ent-default')).resolves.toBe(true);
    await expect(store.findRoleById(role.id)).resolves.toBeUndefined();
  });

  it('updates local identity security state', async () => {
    const store = new PlatformMemoryStore();
    const lockedUntil = '2099-01-01T00:15:00.000Z';
    const lastLoginAt = '2099-01-01T00:00:00.000Z';

    await store.updateLocalIdentitySecurityState('user-admin', {
      failedAttempts: 3,
      lockedUntil,
      lastLoginAt,
    });
    await expect(store.findLocalIdentityByAccount('admin')).resolves.toEqual(
      expect.objectContaining({
        failedAttempts: 3,
        lockedUntil,
        lastLoginAt,
      }),
    );

    await store.updateLocalIdentitySecurityState('user-admin', {
      failedAttempts: 0,
      lockedUntil: null,
    });
    await expect(store.findLocalIdentityByAccount('admin')).resolves.toEqual(
      expect.objectContaining({
        failedAttempts: 0,
        lastLoginAt,
      }),
    );
    expect((await store.findLocalIdentityByAccount('admin'))?.lockedUntil).toBeUndefined();
  });

  it('updates passwords and synchronizes must-change-password across identity and employee records', async () => {
    const store = new PlatformMemoryStore();
    await store.updateLocalIdentitySecurityState('user-admin', {
      failedAttempts: 5,
      lockedUntil: '2099-01-01T00:15:00.000Z',
    });

    await store.updatePassword('user-admin', {
      passwordHash: 'hashed-password-value',
      mustChangePassword: false,
    });

    await expect(store.findLocalIdentityByAccount('admin')).resolves.toEqual(
      expect.objectContaining({
        passwordHash: 'hashed-password-value',
        failedAttempts: 0,
        mustChangePassword: false,
      }),
    );
    expect((await store.findLocalIdentityByAccount('admin'))?.lockedUntil).toBeUndefined();
    await expect(store.findEmployeeById('user-admin')).resolves.toEqual(
      expect.objectContaining({
        mustChangePassword: false,
      }),
    );
  });

  it('lists status logs with stable same-timestamp pagination', async () => {
    const store = new PlatformMemoryStore();
    const createdAt = '2026-06-22T00:00:00.000Z';
    await store.createStatusLogs([
      {
        id: '00000000-0000-0000-0000-000000000001',
        enterpriseId: 'ent-default',
        subjectEmployeeId: 'user-admin',
        authorEmployeeId: 'user-admin',
        content: 'same-time-1',
        createdAt,
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        enterpriseId: 'ent-default',
        subjectEmployeeId: 'user-admin',
        authorEmployeeId: 'user-admin',
        content: 'same-time-2',
        createdAt,
      },
    ]);

    const firstPage = await store.listStatusLogsBySubject('ent-default', 'user-admin', {
      limit: 1,
      offset: 0,
    });
    const secondPage = await store.listStatusLogsBySubject('ent-default', 'user-admin', {
      limit: 1,
      offset: 1,
    });

    expect(firstPage.total).toBe(2);
    expect(secondPage.total).toBe(2);
    expect(firstPage.items.map((item) => item.id)).toEqual([
      '00000000-0000-0000-0000-000000000002',
    ]);
    expect(secondPage.items.map((item) => item.id)).toEqual([
      '00000000-0000-0000-0000-000000000001',
    ]);
  });

  it('sorts same-timestamp status logs by bytewise id descending instead of locale order', async () => {
    const store = new PlatformMemoryStore();
    const createdAt = '2026-06-22T00:00:00.000Z';
    await store.createStatusLogs([
      {
        id: '00000000-0000-0000-0000-00000000000A',
        enterpriseId: 'ent-default',
        subjectEmployeeId: 'user-admin',
        authorEmployeeId: 'user-admin',
        content: 'uppercase-id',
        createdAt,
      },
      {
        id: '00000000-0000-0000-0000-00000000000a',
        enterpriseId: 'ent-default',
        subjectEmployeeId: 'user-admin',
        authorEmployeeId: 'user-admin',
        content: 'lowercase-id',
        createdAt,
      },
    ]);

    const listed = await store.listStatusLogsBySubject('ent-default', 'user-admin', {
      limit: 2,
      offset: 0,
    });

    expect(listed.items.map((item) => item.id)).toEqual([
      '00000000-0000-0000-0000-00000000000a',
      '00000000-0000-0000-0000-00000000000A',
    ]);
  });

  describe('listDescendantDepartmentIds', () => {
    it('expands active descendants within the same enterprise only', async () => {
      const store = new PlatformMemoryStore();
      const root = await store.createDepartment({
        enterpriseId: 'ent-default',
        code: 'TREE',
        name: 'Tree Root',
      });
      const child = await store.createDepartment({
        enterpriseId: 'ent-default',
        parentId: root.id,
        code: 'TREE-C',
        name: 'Tree Child',
      });
      const grandchild = await store.createDepartment({
        enterpriseId: 'ent-default',
        parentId: child.id,
        code: 'TREE-G',
        name: 'Tree Grandchild',
      });
      const sibling = await store.createDepartment({
        enterpriseId: 'ent-default',
        parentId: root.id,
        code: 'TREE-S',
        name: 'Tree Sibling',
      });
      const disabled = await store.createDepartment({
        enterpriseId: 'ent-default',
        parentId: root.id,
        code: 'TREE-D',
        name: 'Tree Disabled',
      });
      store.departments.set(disabled.id, {
        ...disabled,
        status: 'disabled',
      });
      const disabledChild = await store.createDepartment({
        enterpriseId: 'ent-default',
        parentId: disabled.id,
        code: 'TREE-DC',
        name: 'Tree Disabled Child',
      });
      const otherEnterpriseChild = await store.createDepartment({
        enterpriseId: 'ent-other',
        parentId: root.id,
        code: 'TREE-O',
        name: 'Tree Other',
      });

      const descendantIds = await store.listDescendantDepartmentIds(root.id, 'ent-default');

      expect(descendantIds).toEqual(expect.arrayContaining([child.id, grandchild.id, sibling.id]));
      expect(descendantIds).toHaveLength(3);
      expect(descendantIds).not.toContain(root.id);
      expect(descendantIds).not.toContain(disabled.id);
      expect(descendantIds).not.toContain(disabledChild.id);
      expect(descendantIds).not.toContain(otherEnterpriseChild.id);
    });
  });
});
