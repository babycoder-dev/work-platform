import { UnauthorizedException } from '@nestjs/common';
import type { EmployeeDto, PermissionDto, RoleDto } from '@work/platform-contract';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import type { PlatformRepository } from '../repositories/platform.repository';
import { hashPassword, verifyPassword } from '../security/secret-hash';
import { PlatformMemoryStore } from '../store/platform-memory.store';

describe('AuthService', () => {
  it('logs in with the seeded admin account', async () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);

    const result = await service.login(
      {
        account: 'admin',
        password: 'admin123',
      },
      {
        traceId: 'trace-login-unit',
        ip: '203.0.113.10',
        userAgent: 'vitest-agent',
      },
    );

    expect(result.accessToken).toContain('dev-access-');
    expect(result.user.name).toBe('系统管理员');
    expect(result.user.permissions.length).toBeGreaterThan(0);
    expect(store.auditLogs).toEqual([
      expect.objectContaining({
        action: 'auth.login',
        actorAccount: 'admin',
        traceId: 'trace-login-unit',
        ip: '203.0.113.10',
        userAgent: 'vitest-agent',
      }),
    ]);
  });

  it('does not grant permissions from disabled roles', async () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);
    const adminRole = store.roles.get('role-admin');
    if (!adminRole) {
      throw new Error('seed admin role missing');
    }
    store.roles.set('role-admin', {
      ...adminRole,
      status: 'disabled',
    });

    const result = await service.login({
      account: 'admin',
      password: 'admin123',
    });

    expect(result.user.roles).toEqual([]);
    expect(result.user.permissions).toEqual([]);
    expect(result.user.dataScopes).toEqual({
      profile: [],
      presence: [],
      report: [],
    });
  });

  it('fails login when audit writing fails', async () => {
    const store = new PlatformMemoryStore();
    store.recordAuditLog = async () => {
      throw new Error('audit failed');
    };
    const service = new AuthService(store);

    await expect(
      service.login({
        account: 'admin',
        password: 'admin123',
      }),
    ).rejects.toThrow('audit failed');
  });

  it('authenticates issued access tokens', async () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);
    const login = await service.login({
      account: 'admin',
      password: 'admin123',
    });

    const currentUser = await service.authenticateAccessToken(login.accessToken);

    expect(currentUser.id).toBe('user-admin');
    expect(currentUser.permissions.map((permission) => permission.code)).toContain('platform:org:view');
  });

  it('rejects unknown access tokens', async () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);

    await expect(service.authenticateAccessToken('dev-access-missing')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects expired access sessions', async () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);
    await store.createAccessSession({
      accessToken: 'dev-access-expired',
      userId: 'user-admin',
      expiresAt: '2000-01-01T00:00:00.000Z',
    });

    await expect(service.authenticateAccessToken('dev-access-expired')).rejects.toThrow(UnauthorizedException);
  });

  it('resets failed attempts after a successful login', async () => {
    const repository = createRepositoryMock();
    const passwordHash = hashPassword('admin123');
    repository.findLocalIdentityByAccount.mockResolvedValue({
      userId: employee.id,
      account: employee.account,
      passwordHash,
      failedAttempts: 2,
      mustChangePassword: false,
    });
    const service = new AuthService(repository);

    await service.login({ account: 'admin', password: 'admin123' });

    expect(repository.updateLocalIdentitySecurityState).toHaveBeenCalledWith(
      employee.id,
      expect.objectContaining({
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: expect.any(String),
      }),
    );
  });

  it('increments failed attempts and audits a wrong password', async () => {
    const repository = createRepositoryMock();
    repository.findLocalIdentityByAccount.mockResolvedValue({
      userId: employee.id,
      account: employee.account,
      passwordHash: hashPassword('admin123'),
      failedAttempts: 0,
      mustChangePassword: false,
    });
    const service = new AuthService(repository);

    await expect(service.login({ account: 'admin', password: 'wrong-password' })).rejects.toThrow('账号或密码错误');

    expect(repository.updateLocalIdentitySecurityState).toHaveBeenCalledWith(employee.id, {
      failedAttempts: 1,
      lockedUntil: null,
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failure',
        metadata: {
          reason: 'wrong_password',
          failedAttempts: 1,
          locked: false,
        },
      }),
    );
  });

  it('locks the account after the fifth wrong password', async () => {
    const repository = createRepositoryMock();
    repository.findLocalIdentityByAccount.mockResolvedValue({
      userId: employee.id,
      account: employee.account,
      passwordHash: hashPassword('admin123'),
      failedAttempts: 4,
      mustChangePassword: false,
    });
    const service = new AuthService(repository);

    await expect(service.login({ account: 'admin', password: 'wrong-password' })).rejects.toThrow(
      '账号已被锁定，请 15 分钟后重试',
    );

    expect(repository.updateLocalIdentitySecurityState).toHaveBeenCalledWith(
      employee.id,
      expect.objectContaining({
        failedAttempts: 5,
        lockedUntil: expect.any(String),
      }),
    );
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failure',
        metadata: {
          reason: 'wrong_password',
          failedAttempts: 5,
          locked: true,
        },
      }),
    );
  });

  it('rejects locked accounts before checking the password', async () => {
    const repository = createRepositoryMock();
    repository.findLocalIdentityByAccount.mockResolvedValue({
      userId: employee.id,
      account: employee.account,
      passwordHash: hashPassword('admin123'),
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      mustChangePassword: false,
    });
    const service = new AuthService(repository);

    await expect(service.login({ account: 'admin', password: 'admin123' })).rejects.toThrow(
      '账号已被锁定，请 10 分钟后重试',
    );

    expect(repository.findEmployeeById).not.toHaveBeenCalled();
    expect(repository.updateLocalIdentitySecurityState).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failure',
        metadata: {
          reason: 'account_locked',
          remainingMinutes: 10,
        },
      }),
    );
  });

  it('resets the failed-attempt base after an expired lock', async () => {
    const repository = createRepositoryMock();
    repository.findLocalIdentityByAccount.mockResolvedValue({
      userId: employee.id,
      account: employee.account,
      passwordHash: hashPassword('admin123'),
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() - 60 * 1000).toISOString(),
      mustChangePassword: false,
    });
    const service = new AuthService(repository);

    await expect(service.login({ account: 'admin', password: 'wrong-password' })).rejects.toThrow('账号或密码错误');

    expect(repository.updateLocalIdentitySecurityState).toHaveBeenCalledWith(employee.id, {
      failedAttempts: 1,
      lockedUntil: null,
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          reason: 'wrong_password',
          failedAttempts: 1,
          locked: false,
        },
      }),
    );
  });

  it('does not write audit logs for unknown accounts', async () => {
    const repository = createRepositoryMock();
    repository.findLocalIdentityByAccount.mockResolvedValue(undefined);
    const service = new AuthService(repository);

    await expect(service.login({ account: 'missing', password: 'wrong-password' })).rejects.toThrow('账号或密码错误');

    expect(repository.recordAuditLog).not.toHaveBeenCalled();
    expect(repository.updateLocalIdentitySecurityState).not.toHaveBeenCalled();
  });

  it('audits inactive employees without updating identity state', async () => {
    const repository = createRepositoryMock();
    repository.findLocalIdentityByAccount.mockResolvedValue({
      userId: employee.id,
      account: employee.account,
      passwordHash: hashPassword('admin123'),
      failedAttempts: 0,
      mustChangePassword: false,
    });
    repository.findEmployeeById.mockResolvedValue({
      ...employee,
      status: 'disabled',
    });
    const service = new AuthService(repository);

    await expect(service.login({ account: 'admin', password: 'admin123' })).rejects.toThrow('账号或密码错误');

    expect(repository.updateLocalIdentitySecurityState).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failure',
        metadata: {
          reason: 'employee_inactive',
        },
      }),
    );
  });

  it('returns the lock duration in the password policy', () => {
    const service = new AuthService(createRepositoryMock());

    expect(service.getPasswordPolicy()).toEqual(
      expect.objectContaining({
        maxFailedAttempts: 5,
        lockDurationMinutes: 15,
      }),
    );
  });

  it('changes the current user password and clears must-change-password', async () => {
    const repository = createRepositoryMock();
    repository.findEmployeeById.mockResolvedValue({
      ...employee,
      mustChangePassword: true,
    });
    repository.findLocalIdentityByAccount.mockResolvedValue({
      userId: employee.id,
      account: employee.account,
      passwordHash: hashPassword('admin123'),
      failedAttempts: 2,
      mustChangePassword: true,
    });
    const service = new AuthService(repository);

    await service.changePassword(employee.id, {
      oldPassword: 'admin123',
      newPassword: 'Newpass1',
    });

    expect(repository.updatePassword).toHaveBeenCalledWith(employee.id, {
      passwordHash: expect.any(String),
      mustChangePassword: false,
    });
    const updateInput = repository.updatePassword.mock.calls[0][1];
    expect(verifyPassword('Newpass1', updateInput.passwordHash)).toBe(true);
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password.change',
        result: 'success',
        metadata: {
          account: 'admin',
          mustChangePassword: false,
        },
      }),
    );
  });

  it('rejects changePassword when the old password is wrong without updating password state', async () => {
    const repository = createRepositoryMock();
    repository.findLocalIdentityByAccount.mockResolvedValue({
      userId: employee.id,
      account: employee.account,
      passwordHash: hashPassword('admin123'),
      failedAttempts: 3,
      mustChangePassword: true,
    });
    const service = new AuthService(repository);

    await expect(service.changePassword(employee.id, {
      oldPassword: 'wrong',
      newPassword: 'Newpass1',
    })).rejects.toThrow('原密码错误');

    expect(repository.updatePassword).not.toHaveBeenCalled();
    expect(repository.updateLocalIdentitySecurityState).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password.change',
        result: 'failure',
        metadata: {
          account: 'admin',
          reason: 'wrong_old_password',
        },
      }),
    );
  });

  it('rejects changePassword when the new password matches the old password', async () => {
    const repository = createRepositoryMock();
    repository.findLocalIdentityByAccount.mockResolvedValue({
      userId: employee.id,
      account: employee.account,
      passwordHash: hashPassword('admin123'),
      failedAttempts: 0,
      mustChangePassword: true,
    });
    const service = new AuthService(repository);

    await expect(service.changePassword(employee.id, {
      oldPassword: 'admin123',
      newPassword: 'admin123',
    })).rejects.toThrow('新密码不能与原密码相同');

    expect(repository.updatePassword).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password.change',
        result: 'failure',
        metadata: {
          account: 'admin',
          reason: 'same_as_old',
        },
      }),
    );
  });

  it('rejects changePassword for inactive employees without writing audit logs', async () => {
    const repository = createRepositoryMock();
    repository.findEmployeeById.mockResolvedValue({
      ...employee,
      status: 'disabled',
    });
    const service = new AuthService(repository);

    await expect(service.changePassword(employee.id, {
      oldPassword: 'admin123',
      newPassword: 'Newpass1',
    })).rejects.toThrow('登录状态无效');

    expect(repository.findLocalIdentityByAccount).not.toHaveBeenCalled();
    expect(repository.updatePassword).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).not.toHaveBeenCalled();
  });

  it('returns mustChangePassword in current user payloads', async () => {
    const repository = createRepositoryMock();
    repository.findEmployeeById.mockResolvedValue({
      ...employee,
      mustChangePassword: true,
    });
    const service = new AuthService(repository);

    await expect(service.toCurrentUser(employee.id)).resolves.toEqual(
      expect.objectContaining({
        mustChangePassword: true,
      }),
    );
  });

  it('groups active role data scopes by type and excludes disabled roles', async () => {
    const repository = createRepositoryMock();
    repository.findEmployeeById.mockResolvedValue({
      ...employee,
      roleIds: ['role-profile', 'role-presence', 'role-disabled'],
    });
    repository.findRoleById.mockImplementation(async (id: string) => ({
      'role-profile': {
        ...role,
        id,
        code: id,
        dataScopes: [{ dataType: 'profile', scope: 'company' }],
      },
      'role-presence': {
        ...role,
        id,
        code: id,
        dataScopes: [{ dataType: 'presence', scope: 'department' }],
      },
      'role-disabled': {
        ...role,
        id,
        code: id,
        dataScopes: [{ dataType: 'report', scope: 'company' }],
        status: 'disabled',
      },
    })[id]);
    const service = new AuthService(repository);

    await expect(service.toCurrentUser(employee.id)).resolves.toEqual(
      expect.objectContaining({
        dataScopes: {
          profile: ['company'],
          presence: ['department'],
          report: [],
        },
      }),
    );
  });
});

const employee: EmployeeDto = {
  id: 'user-admin',
  enterpriseId: 'ent-default',
  employeeNo: '000001',
  account: 'admin',
  name: '系统管理员',
  departmentId: 'dept-root',
  status: 'active',
  roleIds: ['role-admin'],
  mustChangePassword: false,
};

const role: RoleDto = {
  id: 'role-admin',
  enterpriseId: 'ent-default',
  code: 'admin',
  name: '系统管理员',
  permissionCodes: ['platform:org:view'],
  dataScopes: [
    { dataType: 'profile', scope: 'company' },
    { dataType: 'presence', scope: 'company' },
    { dataType: 'report', scope: 'company' },
  ],
  isSystem: true,
  status: 'active',
};

const permission: PermissionDto = {
  code: 'platform:org:view',
  name: '查看组织架构',
  moduleName: 'platform',
};

function createRepositoryMock() {
  return {
    listEnterprises: vi.fn().mockResolvedValue([]),
    listDepartments: vi.fn().mockResolvedValue([]),
    createDepartment: vi.fn(),
    findDepartmentById: vi.fn().mockResolvedValue({
      id: 'dept-root',
      enterpriseId: 'ent-default',
      code: 'HQ',
      name: '总部',
      sortOrder: 1,
      status: 'active',
    }),
    listDescendantDepartmentIds: vi.fn().mockResolvedValue([]),
    listEmployees: vi.fn().mockResolvedValue([]),
    createEmployee: vi.fn(),
    findEmployeeById: vi.fn().mockResolvedValue(employee),
    findLocalIdentityByAccount: vi.fn(),
    updateLocalIdentitySecurityState: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    updateEmployee: vi.fn(),
    createAccessSession: vi.fn().mockImplementation(async (input) => input),
    findAccessSession: vi.fn().mockResolvedValue(undefined),
    listPermissions: vi.fn().mockResolvedValue([]),
    findPermissionByCode: vi.fn().mockResolvedValue(permission),
    listMenusByPermissionCodes: vi.fn().mockResolvedValue([]),
    listActiveModuleManifests: vi.fn().mockResolvedValue([]),
    listRoles: vi.fn().mockResolvedValue([]),
    findRoleById: vi.fn().mockResolvedValue(role),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    countUsersWithRole: vi.fn(),
    setUserRoles: vi.fn(),
    recordAuditLog: vi.fn().mockResolvedValue(undefined),
  } as PlatformRepository & {
    findLocalIdentityByAccount: ReturnType<typeof vi.fn>;
    updateLocalIdentitySecurityState: ReturnType<typeof vi.fn>;
    updatePassword: ReturnType<typeof vi.fn>;
    findEmployeeById: ReturnType<typeof vi.fn>;
    findDepartmentById: ReturnType<typeof vi.fn>;
    listDescendantDepartmentIds: ReturnType<typeof vi.fn>;
    findPermissionByCode: ReturnType<typeof vi.fn>;
    findRoleById: ReturnType<typeof vi.fn>;
    createAccessSession: ReturnType<typeof vi.fn>;
    findAccessSession: ReturnType<typeof vi.fn>;
    recordAuditLog: ReturnType<typeof vi.fn>;
  };
}
