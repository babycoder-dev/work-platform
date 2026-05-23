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
});
