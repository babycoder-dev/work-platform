import { describe, expect, it } from 'vitest';
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
    await expect(store.validatePassword('admin', 'admin123')).resolves.toEqual(
      expect.objectContaining({
        account: 'admin',
        name: '系统管理员',
      }),
    );
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

    expect(updated?.roleIds).toEqual(['role-admin']);
    expect((await store.validatePassword('zhangsan', 'Passw0rd'))?.id).toBe(employee.id);
  });
});
