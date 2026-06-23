import { NotFoundException } from '@nestjs/common';
import type { EventBus } from '@work/event-bus';
import type {
  DepartmentDto,
  EmployeeDto,
  CurrentUserDto,
  PlatformScope,
  UpdateEmployeeProfileInput,
  UpdateMyProfileInput,
} from '@work/platform-contract';
import { platformEvents } from '@work/platform-contract';
import { describe, expect, it, vi } from 'vitest';
import type { PlatformAuditContext } from '../auth/request-user';
import type { PlatformRepository } from '../repositories/platform.repository';
import type { PlatformScopeService } from '../scope/platform-scope.service';
import { EmployeeService } from './employee.service';

const auditContext: PlatformAuditContext = {
  actorUserId: 'user-admin',
  actorAccount: 'admin',
  traceId: 'trace-profile',
  ip: '198.51.100.20',
  userAgent: 'employee-service-spec',
};

const currentUser: CurrentUserDto = {
  id: 'user-admin',
  enterpriseId: 'ent-default',
  account: 'admin',
  employeeNo: '000001',
  name: '管理员',
  roles: ['系统管理员'],
  permissions: [],
  dataScopes: {
    profile: ['company'],
    presence: ['company'],
    report: ['company'],
  },
  mustChangePassword: false,
};

describe('EmployeeService profile read/write', () => {
  it('reads employee detail only when the profile data scope contains the target', async () => {
    const target = employee({ id: 'employee-target', departmentId: 'dept-1' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockResolvedValue(target),
    });
    const service = makeEmployeeService(
      repository,
      makeScopeService({
        kind: 'department',
        enterpriseId: 'ent-default',
        userId: currentUser.id,
        departmentIds: ['dept-1'],
        degradedFromCustom: false,
      }),
    );

    await expect(service.getEmployeeById(target.id, currentUser)).resolves.toEqual(target);

    const outsideScopeService = makeEmployeeService(
      repository,
      makeScopeService({
        kind: 'department',
        enterpriseId: 'ent-default',
        userId: currentUser.id,
        departmentIds: ['dept-other'],
        degradedFromCustom: false,
      }),
    );
    await expect(
      outsideScopeService.getEmployeeById(target.id, currentUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reads the current user profile without profile view permission or scope expansion', async () => {
    const target = employee({ id: currentUser.id, name: '本人' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockResolvedValue(target),
    });
    const service = makeEmployeeService(
      repository,
      makeScopeService({
        kind: 'self',
        enterpriseId: 'ent-default',
        userId: currentUser.id,
        departmentIds: [],
        degradedFromCustom: false,
      }),
    );

    await expect(service.getMyProfile(currentUser)).resolves.toEqual(target);
  });

  it('updates self profile with value-based tri-state merge and keeps management-only fields', async () => {
    const target = employee({
      id: currentUser.id,
      departmentId: 'dept-1',
      title: '旧职务',
      mobile: '13800000000',
      email: 'old@example.com',
    });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockResolvedValue(target),
      updateEmployee: vi.fn().mockImplementation(async (next: EmployeeDto) => next),
    });
    const service = makeEmployeeService(
      repository,
      makeScopeService({
        kind: 'self',
        enterpriseId: 'ent-default',
        userId: currentUser.id,
        departmentIds: [],
        degradedFromCustom: false,
      }),
    );

    const input: UpdateMyProfileInput & { departmentId?: string; status?: string } = {
      title: null,
      mobile: '13900000000',
      departmentId: 'dept-other',
      status: 'disabled',
    };
    await expect(
      service.updateEmployeeProfile(target.id, input, 'self', currentUser, auditContext),
    ).resolves.toEqual(
      expect.objectContaining({
        departmentId: 'dept-1',
        title: undefined,
        mobile: '13900000000',
        email: 'old@example.com',
        status: 'active',
      }),
    );

    expect(repository.updateEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        id: target.id,
        departmentId: 'dept-1',
        title: undefined,
        mobile: '13900000000',
        email: 'old@example.com',
        status: 'active',
      }),
      'ent-default',
    );
    expect(target.title).toBe('旧职务');
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.employee.profile.update',
        resourceId: target.id,
        result: 'success',
        metadata: expect.objectContaining({
          mode: 'self',
          changedFields: ['title', 'mobile'],
        }),
      }),
    );
  });

  it('updates managed profile within profile scope and validates department tenant', async () => {
    const target = employee({ id: 'employee-target', departmentId: 'dept-1', title: '旧职务' });
    const department = makeDepartment({ id: 'dept-2' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockResolvedValue(target),
      findDepartmentById: vi.fn().mockResolvedValue(department),
      updateEmployee: vi.fn().mockImplementation(async (next: EmployeeDto) => next),
    });
    const service = makeEmployeeService(
      repository,
      makeScopeService({
        kind: 'department',
        enterpriseId: 'ent-default',
        userId: currentUser.id,
        departmentIds: ['dept-1'],
        degradedFromCustom: false,
      }),
    );
    const input: UpdateEmployeeProfileInput = {
      name: '新姓名',
      title: null,
      departmentId: 'dept-2',
    };

    await expect(
      service.updateEmployeeProfile(target.id, input, 'management', currentUser, auditContext),
    ).resolves.toEqual(
      expect.objectContaining({
        name: '新姓名',
        title: undefined,
        departmentId: 'dept-2',
      }),
    );
    expect(repository.findDepartmentById).toHaveBeenCalledWith('dept-2');
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.employee.profile.update',
        result: 'success',
        metadata: expect.objectContaining({
          mode: 'management',
          changedFields: ['name', 'title', 'departmentId'],
        }),
      }),
    );
  });

  it('hides out-of-scope profile write targets and records bounded failure audit', async () => {
    const target = employee({ id: 'employee-target', departmentId: 'dept-outside' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockResolvedValue(target),
    });
    const service = makeEmployeeService(
      repository,
      makeScopeService({
        kind: 'department',
        enterpriseId: 'ent-default',
        userId: currentUser.id,
        departmentIds: ['dept-1'],
        degradedFromCustom: false,
      }),
    );

    await expect(
      service.updateEmployeeProfile(
        target.id,
        { mobile: '13900000000' },
        'management',
        currentUser,
        auditContext,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.updateEmployee).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.employee.profile.update',
        resourceId: target.id,
        result: 'failure',
      }),
    );
  });

  it('publishes profile.updated only for third-party profile writes with changed field names', async () => {
    const target = employee({ id: 'employee-target', departmentId: 'dept-1', title: '旧职务' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockResolvedValue(target),
      updateEmployee: vi.fn().mockImplementation(async (next: EmployeeDto) => next),
    });
    const eventBus = makeEventBus();
    const service = makeEmployeeService(repository, makeScopeService(makeCompanyScope()), eventBus);

    await service.updateEmployeeProfile(
      target.id,
      { title: '新职务' },
      'management',
      currentUser,
      auditContext,
    );

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const event = eventBus.publish.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      type: platformEvents.profileUpdated,
      source: 'platform.api',
      traceId: 'trace-profile',
      payload: {
        enterpriseId: 'ent-default',
        subjectUserId: target.id,
        changedBy: currentUser.id,
        changedFields: ['title'],
      },
    });
    expect(Object.keys(event.payload).sort()).toEqual([
      'changedBy',
      'changedFields',
      'enterpriseId',
      'subjectUserId',
    ]);
    expect(event.payload).not.toHaveProperty('title');
    expect(event.payload).not.toHaveProperty('newValue');
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          changedFields: event.payload.changedFields,
        }),
      }),
    );
  });

  it('does not publish profile.updated for self writes, management writes to self, or no-op writes', async () => {
    const self = employee({ id: currentUser.id, title: '旧职务' });
    const other = employee({ id: 'employee-other', name: '原姓名' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockImplementation(async (id: string) => {
        return id === currentUser.id ? self : other;
      }),
      updateEmployee: vi.fn().mockImplementation(async (next: EmployeeDto) => next),
    });
    const eventBus = makeEventBus();
    const service = makeEmployeeService(repository, makeScopeService(makeCompanyScope()), eventBus);

    await service.updateEmployeeProfile(
      self.id,
      { title: '新职务' },
      'self',
      currentUser,
      auditContext,
    );
    await service.updateEmployeeProfile(
      other.id,
      { name: '原姓名' },
      'management',
      currentUser,
      auditContext,
    );
    await service.updateEmployeeProfile(
      self.id,
      { title: '再次变更' },
      'management',
      currentUser,
      auditContext,
    );

    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('keeps successful profile writes when profile.updated publish fails', async () => {
    const target = employee({ id: 'employee-target', departmentId: 'dept-1', title: '旧职务' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockResolvedValue(target),
      updateEmployee: vi.fn().mockImplementation(async (next: EmployeeDto) => next),
    });
    const eventBus = makeEventBus();
    eventBus.publish.mockRejectedValue(new Error('bus down'));
    const service = makeEmployeeService(repository, makeScopeService(makeCompanyScope()), eventBus);

    await expect(
      service.updateEmployeeProfile(
        target.id,
        { title: '新职务' },
        'management',
        currentUser,
        auditContext,
      ),
    ).resolves.toEqual(expect.objectContaining({ title: '新职务' }));
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.employee.profile.update',
        result: 'success',
      }),
    );
  });
});

function makeEmployeeService(
  repository: PlatformRepository,
  scopeService: PlatformScopeService,
  eventBus = makeEventBus(),
): EmployeeService {
  return new EmployeeService(repository, scopeService, eventBus);
}

function makeRepository(
  overrides: Partial<Record<keyof PlatformRepository, ReturnType<typeof vi.fn>>> = {},
) {
  return {
    findEmployeeById: vi.fn(),
    findDepartmentById: vi.fn(),
    updateEmployee: vi.fn(),
    recordAuditLog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as PlatformRepository;
}

function makeScopeService(scope: PlatformScope): PlatformScopeService {
  return {
    resolveScope: vi.fn().mockResolvedValue(scope),
    matchesScope: vi
      .fn()
      .mockImplementation((employee: EmployeeDto, resolvedScope: PlatformScope) => {
        if (employee.enterpriseId !== resolvedScope.enterpriseId) {
          return false;
        }
        switch (resolvedScope.kind) {
          case 'company':
            return true;
          case 'self':
            return employee.id === resolvedScope.userId;
          case 'department':
          case 'department_tree':
            return (
              employee.departmentId !== undefined &&
              resolvedScope.departmentIds.includes(employee.departmentId)
            );
        }
      }),
  } as unknown as PlatformScopeService;
}

function makeCompanyScope(): PlatformScope {
  return {
    kind: 'company',
    enterpriseId: 'ent-default',
    userId: currentUser.id,
    departmentIds: [],
    degradedFromCustom: false,
  };
}

function makeEventBus(): EventBus & { publish: ReturnType<typeof vi.fn> } {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
  } as unknown as EventBus & { publish: ReturnType<typeof vi.fn> };
}

function employee(overrides: Partial<EmployeeDto> = {}): EmployeeDto {
  return {
    id: 'employee-1',
    enterpriseId: 'ent-default',
    employeeNo: 'E001',
    account: 'employee',
    name: '员工',
    status: 'active',
    roleIds: [],
    mustChangePassword: false,
    ...overrides,
  };
}

function makeDepartment(overrides: Partial<DepartmentDto> = {}): DepartmentDto {
  return {
    id: 'dept-1',
    enterpriseId: 'ent-default',
    code: 'DEPT',
    name: '部门',
    sortOrder: 100,
    status: 'active',
    ...overrides,
  };
}
