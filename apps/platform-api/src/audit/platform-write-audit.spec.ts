import type { DepartmentDto, EmployeeDto, RoleDto } from '@work/platform-contract';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { OrgService } from '../org/org.service';
import type { PlatformRepository } from '../repositories/platform.repository';
import { RbacService } from '../rbac/rbac.service';
import { hashPassword, verifyPassword } from '../security/secret-hash';
import { EmployeeService } from '../users/employee.service';

const auditContext = {
  actorUserId: 'user-admin',
  actorAccount: 'admin',
  traceId: 'trace-write-audit',
  ip: '198.51.100.30',
  userAgent: 'service-spec-agent',
};

describe('platform write audit coverage', () => {
  it('records department creation audit context', async () => {
    const department: DepartmentDto = {
      id: 'dept-audit',
      enterpriseId: 'ent-default',
      code: 'AUDIT',
      name: 'Audit Department',
      sortOrder: 100,
      status: 'active',
    };
    const repository = {
      createDepartment: vi.fn().mockResolvedValue(department),
      recordAuditLog: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlatformRepository;

    await expect(new OrgService(repository).createDepartment({
      enterpriseId: department.enterpriseId,
      code: department.code,
      name: department.name,
    }, auditContext)).resolves.toEqual(department);

    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAccount: 'admin',
        action: 'platform.department.create',
        resourceType: 'platform.department',
        resourceId: department.id,
        traceId: 'trace-write-audit',
        ip: '198.51.100.30',
        userAgent: 'service-spec-agent',
        result: 'success',
      }),
    );
  });

  it('records employee write audit actions', async () => {
    const employee: EmployeeDto = {
      id: 'employee-audit',
      enterpriseId: 'ent-default',
      employeeNo: 'E-AUDIT',
      account: 'employee-audit',
      name: 'Employee Audit',
      status: 'active',
      roleIds: [],
      mustChangePassword: true,
    };
    const repository = {
      createEmployee: vi.fn().mockResolvedValue(employee),
      findEmployeeById: vi.fn().mockResolvedValue(employee),
      updateEmployee: vi.fn().mockResolvedValue({ ...employee, status: 'disabled' }),
      setUserRoles: vi.fn().mockResolvedValue({ ...employee, roleIds: ['role-audit'] }),
      recordAuditLog: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlatformRepository;
    const service = new EmployeeService(repository);

    await service.createEmployee({
      enterpriseId: employee.enterpriseId,
      employeeNo: employee.employeeNo,
      account: employee.account,
      name: employee.name,
      initialPassword: 'Passw0rd1',
    }, auditContext);
    await service.updateStatus(employee.id, { status: 'disabled' }, auditContext);
    await service.assignRoles({ userId: employee.id, roleIds: ['role-audit'] }, auditContext);

    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.employee.create',
        resourceId: employee.id,
      }),
    );
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.employee.status.update',
        resourceId: employee.id,
        metadata: {
          previousStatus: 'active',
          status: 'disabled',
        },
      }),
    );
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.employee.roles.assign',
        resourceId: employee.id,
        metadata: {
          roleIds: ['role-audit'],
        },
      }),
    );
  });

  it('records user password change audit actions', async () => {
    const employee: EmployeeDto = {
      id: 'employee-audit',
      enterpriseId: 'ent-default',
      employeeNo: 'E-AUDIT',
      account: 'employee-audit',
      name: 'Employee Audit',
      status: 'active',
      roleIds: [],
      mustChangePassword: true,
    };
    const repository = {
      findEmployeeById: vi.fn().mockResolvedValue(employee),
      findLocalIdentityByAccount: vi.fn().mockResolvedValue({
        userId: employee.id,
        account: employee.account,
        passwordHash: hashPassword('Oldpass1'),
        failedAttempts: 2,
        mustChangePassword: true,
      }),
      updatePassword: vi.fn().mockResolvedValue(undefined),
      recordAuditLog: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlatformRepository;

    await new AuthService(repository).changePassword(employee.id, {
      oldPassword: 'Oldpass1',
      newPassword: 'Newpass1',
    }, auditContext);

    const updateInput = vi.mocked(repository.updatePassword).mock.calls[0][1];
    expect(verifyPassword('Newpass1', updateInput.passwordHash)).toBe(true);
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAccount: employee.account,
        action: 'auth.password.change',
        resourceType: 'platform.local_identity',
        resourceId: employee.id,
        result: 'success',
        metadata: {
          account: employee.account,
          mustChangePassword: false,
        },
      }),
    );
  });

  it('records employee password reset audit actions', async () => {
    const employee: EmployeeDto = {
      id: 'employee-audit',
      enterpriseId: 'ent-default',
      employeeNo: 'E-AUDIT',
      account: 'employee-audit',
      name: 'Employee Audit',
      status: 'active',
      roleIds: [],
      mustChangePassword: false,
    };
    const repository = {
      findEmployeeById: vi.fn().mockResolvedValue(employee),
      updatePassword: vi.fn().mockResolvedValue(undefined),
      recordAuditLog: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlatformRepository;

    const result = await new EmployeeService(repository).resetPassword(employee.id, {
      newPassword: 'Resetpass1',
    }, auditContext);

    const updateInput = vi.mocked(repository.updatePassword).mock.calls[0][1];
    expect(verifyPassword('Resetpass1', updateInput.passwordHash)).toBe(true);
    expect(updateInput.mustChangePassword).toBe(true);
    expect(result.mustChangePassword).toBe(true);
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAccount: 'admin',
        action: 'platform.employee.password.reset',
        resourceType: 'platform.employee',
        resourceId: employee.id,
        result: 'success',
        metadata: {
          account: employee.account,
          employeeStatus: employee.status,
          mustChangePassword: true,
          lockoutCleared: true,
        },
      }),
    );
  });

  it('does not swallow audit write failures', async () => {
    const role: RoleDto = {
      id: 'role-audit',
      enterpriseId: 'ent-default',
      code: 'audit-role',
      name: 'Audit Role',
      permissionCodes: [],
      dataScope: 'self',
      status: 'active',
    };
    const repository = {
      createRole: vi.fn().mockResolvedValue(role),
      recordAuditLog: vi.fn().mockRejectedValue(new Error('audit unavailable')),
    } as unknown as PlatformRepository;

    await expect(new RbacService(repository).createRole({
      enterpriseId: role.enterpriseId,
      code: role.code,
      name: role.name,
      permissionCodes: [],
      dataScope: 'self',
    }, auditContext)).rejects.toThrow('audit unavailable');
  });
});
