import { describe, expect, it } from 'vitest';
import { verifyPassword } from '../security/secret-hash';
import { PlatformMemoryStore } from './platform-memory.store';

describe('PlatformMemoryStore', () => {
  it('seeds the default enterprise, department, admin and permissions', async () => {
    const store = new PlatformMemoryStore();

    await expect(store.listEnterprises()).resolves.toEqual([
      expect.objectContaining({
        code: 'default',
        name: '默认企业',
      }),
    ]);
    await expect(store.listDepartments()).resolves.toEqual([
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
      initialPassword: 'Passw0rd',
    });

    const updated = await store.setUserRoles(employee.id, ['role-admin']);

    const identity = await store.findLocalIdentityByAccount('zhangsan');
    expect(updated?.roleIds).toEqual(['role-admin']);
    expect(identity?.userId).toBe(employee.id);
    expect(verifyPassword('Passw0rd', identity?.passwordHash ?? '')).toBe(true);
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
