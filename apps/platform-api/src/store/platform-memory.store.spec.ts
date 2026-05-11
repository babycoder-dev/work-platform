import { describe, expect, it } from 'vitest';
import { PlatformMemoryStore } from './platform-memory.store';

describe('PlatformMemoryStore', () => {
  it('seeds the default enterprise, department, admin and permissions', () => {
    const store = new PlatformMemoryStore();

    expect(store.listEnterprises()).toEqual([
      expect.objectContaining({
        code: 'default',
        name: '默认企业',
      }),
    ]);
    expect(store.listDepartments()).toEqual([
      expect.objectContaining({
        code: 'HQ',
        name: '总部',
      }),
    ]);
    expect(store.validatePassword('admin', 'admin123')).toEqual(
      expect.objectContaining({
        account: 'admin',
        name: '系统管理员',
      }),
    );
    expect(store.listPermissions().length).toBeGreaterThan(0);
  });

  it('stores issued access sessions', () => {
    const store = new PlatformMemoryStore();
    const session = store.createAccessSession({
      accessToken: 'dev-access-test',
      userId: 'user-admin',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });

    expect(session.userId).toBe('user-admin');
    expect(store.findAccessSession('dev-access-test')).toEqual(session);
  });

  it('creates employees and assigns roles through the repository contract', () => {
    const store = new PlatformMemoryStore();
    const employee = store.createEmployee({
      enterpriseId: 'ent-default',
      employeeNo: '000002',
      account: 'zhangsan',
      name: '张三',
      initialPassword: 'Passw0rd',
    });

    const updated = store.setUserRoles(employee.id, ['role-admin']);

    expect(updated?.roleIds).toEqual(['role-admin']);
    expect(store.validatePassword('zhangsan', 'Passw0rd')?.id).toBe(employee.id);
  });
});
