import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DepartmentDto, EmployeeDto } from '@work/platform-contract';
import type { PlatformAuditContext } from '../auth/request-user';
import type { PlatformRepository } from '../repositories/platform.repository';
import { OrgService } from './org.service';

const auditContext: PlatformAuditContext = {
  actorUserId: 'user-admin',
  actorAccount: 'admin',
  traceId: 'trace-org',
  ip: '198.51.100.10',
  userAgent: 'org-service-spec',
};

describe('OrgService', () => {
  it('updates department fields and records changed metadata', async () => {
    const root = department({ id: 'dept-root', name: '总部' });
    const child = department({ id: 'dept-child', name: '研发部', parentId: root.id });
    const manager = employee({ id: 'manager-1' });
    const updated = department({
      ...child,
      name: '产品研发部',
      parentId: undefined,
      managerUserId: manager.id,
      sortOrder: 20,
    });
    const repository = makeRepository({
      findDepartmentById: vi.fn()
        .mockResolvedValueOnce(child)
        .mockResolvedValueOnce(root),
      findEmployeeById: vi.fn().mockResolvedValue(manager),
      listDescendantDepartmentIdsForCycleCheck: vi.fn().mockResolvedValue([]),
      updateDepartment: vi.fn().mockResolvedValue(updated),
    });

    await expect(
      new OrgService(repository).updateDepartment(
        child.id,
        {
          name: updated.name,
          parentId: null,
          managerUserId: manager.id,
          sortOrder: updated.sortOrder,
        },
        'ent-default',
        auditContext,
      ),
    ).resolves.toEqual(updated);

    expect(repository.updateDepartment).toHaveBeenCalledWith(
      child.id,
      {
        name: updated.name,
        parentId: null,
        managerUserId: manager.id,
        sortOrder: updated.sortOrder,
      },
      'ent-default',
    );
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.department.update',
        resourceId: child.id,
        result: 'success',
        metadata: expect.objectContaining({
          changedFields: ['name', 'parentId', 'managerUserId', 'sortOrder'],
          previous: expect.objectContaining({
            name: '研发部',
            parentId: 'dept-root',
            managerUserId: null,
            sortOrder: 100,
          }),
          next: expect.objectContaining({
            name: '产品研发部',
            parentId: null,
            managerUserId: 'manager-1',
            sortOrder: 20,
          }),
        }),
      }),
    );
  });

  it('rejects manager and parent references outside the authenticated enterprise', async () => {
    const existing = department({ id: 'dept-1' });
    const repository = makeRepository({
      findDepartmentById: vi.fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(department({ id: 'dept-other', enterpriseId: 'ent-other' })),
    });

    await expect(
      new OrgService(repository).updateDepartment(
        existing.id,
        { parentId: 'dept-other' },
        'ent-default',
        auditContext,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.department.update',
        result: 'failure',
      }),
    );
  });

  it('rejects moving a department under itself or a descendant', async () => {
    const existing = department({ id: 'dept-1' });
    const child = department({ id: 'dept-child', parentId: existing.id });
    const repository = makeRepository({
      findDepartmentById: vi.fn()
        .mockResolvedValue(existing),
      listDescendantDepartmentIdsForCycleCheck: vi.fn().mockResolvedValue([child.id]),
    });
    const service = new OrgService(repository);

    await expect(service.updateDepartment(existing.id, { parentId: existing.id }, 'ent-default')).rejects.toMatchObject({
      code: 'PLATFORM_DEPARTMENT_CYCLE',
      status: 400,
    });
    await expect(service.updateDepartment(existing.id, { parentId: child.id }, 'ent-default')).rejects.toMatchObject({
      code: 'PLATFORM_DEPARTMENT_CYCLE',
      status: 400,
    });
  });

  it('hides cross-enterprise departments as not found', async () => {
    const repository = makeRepository({
      findDepartmentById: vi.fn().mockResolvedValue(department({ enterpriseId: 'ent-other' })),
    });

    await expect(
      new OrgService(repository).updateDepartment(
        'dept-other',
        { name: '跨租户' },
        'ent-default',
        auditContext,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      new OrgService(repository).deleteDepartment('dept-other', 'ent-default', auditContext),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects deleting occupied departments and deletes empty departments', async () => {
    const occupied = department({ id: 'dept-occupied' });
    const empty = department({ id: 'dept-empty' });
    const repository = makeRepository({
      findDepartmentById: vi.fn()
        .mockResolvedValueOnce(occupied)
        .mockResolvedValueOnce(empty),
      countActiveEmployeesInDepartment: vi.fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0),
      hasActiveChildDepartments: vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false),
      softDeleteDepartment: vi.fn().mockResolvedValue(true),
    });
    const service = new OrgService(repository);

    await expect(service.deleteDepartment(occupied.id, 'ent-default', auditContext)).rejects.toMatchObject({
      code: 'PLATFORM_DEPARTMENT_NOT_EMPTY',
      status: 409,
    });
    await expect(service.deleteDepartment(empty.id, 'ent-default', auditContext)).resolves.toEqual({
      success: true,
    });
    expect(repository.softDeleteDepartment).toHaveBeenCalledWith(empty.id, 'ent-default');
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.department.delete',
        resourceId: empty.id,
        result: 'success',
      }),
    );
  });

  it('maps atomic soft-delete occupancy races to department not empty', async () => {
    const existing = department({ id: 'dept-race' });
    const repository = makeRepository({
      findDepartmentById: vi.fn().mockResolvedValue(existing),
      countActiveEmployeesInDepartment: vi.fn().mockResolvedValue(0),
      hasActiveChildDepartments: vi.fn().mockResolvedValue(false),
      softDeleteDepartment: vi.fn().mockResolvedValue(false),
    });

    await expect(
      new OrgService(repository).deleteDepartment(existing.id, 'ent-default', auditContext),
    ).rejects.toMatchObject({
      code: 'PLATFORM_DEPARTMENT_NOT_EMPTY',
      status: 409,
    });
  });
});

function makeRepository(overrides: Partial<Record<keyof PlatformRepository, ReturnType<typeof vi.fn>>> = {}) {
  return {
    findDepartmentById: vi.fn(),
    findEmployeeById: vi.fn(),
    listDescendantDepartmentIdsForCycleCheck: vi.fn().mockResolvedValue([]),
    updateDepartment: vi.fn(),
    countActiveEmployeesInDepartment: vi.fn().mockResolvedValue(0),
    hasActiveChildDepartments: vi.fn().mockResolvedValue(false),
    softDeleteDepartment: vi.fn().mockResolvedValue(true),
    recordAuditLog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as PlatformRepository;
}

function department(overrides: Partial<DepartmentDto> = {}): DepartmentDto {
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
