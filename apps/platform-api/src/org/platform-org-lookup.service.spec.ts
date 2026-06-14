import type { DepartmentDto, EmployeeDto, RoleDto } from '@work/platform-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformRepository } from '../repositories/platform.repository';
import { PlatformOrgLookupService } from './platform-org-lookup.service';

describe('PlatformOrgLookupService', () => {
  let repository: MockPlatformRepository;
  let service: PlatformOrgLookupService;

  beforeEach(() => {
    repository = createRepositoryMock();
    service = new PlatformOrgLookupService(repository as unknown as PlatformRepository);
  });

  it('resolves an active employee department manager in the same enterprise', async () => {
    repository.findEmployeeById.mockResolvedValue(employee({ departmentId: 'dept-1' }));
    repository.findDepartmentById.mockResolvedValue(department({ managerUserId: 'manager-1' }));
    repository.findEmployeeById.mockResolvedValueOnce(employee({ departmentId: 'dept-1' }));
    repository.findEmployeeById.mockResolvedValueOnce(employee({ id: 'manager-1' }));

    await expect(service.resolveDepartmentManager('ent-1', 'user-1')).resolves.toEqual({
      managerUserId: 'manager-1',
    });
    expect(repository.findDepartmentById).toHaveBeenCalledWith('dept-1');
  });

  it('returns empty for cross-enterprise users, inactive users, missing departments, or unmanaged departments', async () => {
    repository.findEmployeeById.mockResolvedValue(employee({ enterpriseId: 'ent-other' }));
    await expect(service.resolveDepartmentManager('ent-1', 'user-1')).resolves.toEqual({});

    repository.findEmployeeById.mockResolvedValue(employee({ status: 'disabled', departmentId: 'dept-1' }));
    await expect(service.resolveDepartmentManager('ent-1', 'user-1')).resolves.toEqual({});

    repository.findEmployeeById.mockResolvedValue(employee({ departmentId: undefined }));
    await expect(service.resolveDepartmentManager('ent-1', 'user-1')).resolves.toEqual({});

    repository.findEmployeeById.mockResolvedValue(employee({ departmentId: 'dept-1' }));
    repository.findDepartmentById.mockResolvedValue(department({ managerUserId: undefined }));
    await expect(service.resolveDepartmentManager('ent-1', 'user-1')).resolves.toEqual({});

    repository.findDepartmentById.mockResolvedValue(department({ enterpriseId: 'ent-other', managerUserId: 'manager-1' }));
    await expect(service.resolveDepartmentManager('ent-1', 'user-1')).resolves.toEqual({});
  });

  it('returns empty when the department manager is missing, inactive, or cross-enterprise', async () => {
    repository.findDepartmentById.mockResolvedValue(department({ managerUserId: 'manager-1' }));

    repository.findEmployeeById
      .mockResolvedValueOnce(employee({ departmentId: 'dept-1' }))
      .mockResolvedValueOnce(undefined);
    await expect(service.resolveDepartmentManager('ent-1', 'user-1')).resolves.toEqual({});

    repository.findEmployeeById
      .mockResolvedValueOnce(employee({ departmentId: 'dept-1' }))
      .mockResolvedValueOnce(employee({ id: 'manager-1', status: 'left' }));
    await expect(service.resolveDepartmentManager('ent-1', 'user-1')).resolves.toEqual({});

    repository.findEmployeeById
      .mockResolvedValueOnce(employee({ departmentId: 'dept-1' }))
      .mockResolvedValueOnce(employee({ id: 'manager-1', enterpriseId: 'ent-other' }));
    await expect(service.resolveDepartmentManager('ent-1', 'user-1')).resolves.toEqual({});
  });

  it('lists active users with the requested active role code in the same enterprise', async () => {
    repository.listRoles.mockResolvedValue([
      role({ id: 'role-target', code: 'hr' }),
      role({ id: 'role-disabled', code: 'assistant', status: 'disabled' }),
    ]);
    repository.listEmployees.mockResolvedValue([
      employee({ id: 'user-1', roleIds: ['role-target'] }),
      employee({ id: 'user-2', roleIds: ['role-target'] }),
      employee({ id: 'user-2', roleIds: ['role-target'] }),
      employee({ id: 'user-3', enterpriseId: 'ent-other', roleIds: ['role-target'] }),
      employee({ id: 'user-4', status: 'left', roleIds: ['role-target'] }),
      employee({ id: 'user-5', roleIds: ['role-other'] }),
    ]);

    await expect(service.listUserIdsByRole('ent-1', 'hr')).resolves.toEqual(['user-1', 'user-2']);
    await expect(service.listUserIdsByRole('ent-1', 'missing')).resolves.toEqual([]);
    await expect(service.listUserIdsByRole('ent-1', 'assistant')).resolves.toEqual([]);
  });
});

type MockPlatformRepository = Pick<
  PlatformRepository,
  'findEmployeeById' | 'findDepartmentById' | 'listRoles' | 'listEmployees'
> & {
  findEmployeeById: ReturnType<typeof vi.fn>;
  findDepartmentById: ReturnType<typeof vi.fn>;
  listRoles: ReturnType<typeof vi.fn>;
  listEmployees: ReturnType<typeof vi.fn>;
};

function createRepositoryMock(): MockPlatformRepository {
  return {
    findEmployeeById: vi.fn(),
    findDepartmentById: vi.fn(),
    listRoles: vi.fn(),
    listEmployees: vi.fn(),
  };
}

function employee(overrides: Partial<EmployeeDto> = {}): EmployeeDto {
  return {
    id: 'user-1',
    enterpriseId: 'ent-1',
    employeeNo: 'E001',
    account: 'alice',
    name: 'Alice',
    status: 'active',
    roleIds: [],
    mustChangePassword: false,
    ...overrides,
  };
}

function department(overrides: Partial<DepartmentDto> = {}): DepartmentDto {
  return {
    id: 'dept-1',
    enterpriseId: 'ent-1',
    name: 'Department',
    code: 'dept',
    sortOrder: 1,
    status: 'active',
    ...overrides,
  };
}

function role(overrides: Partial<RoleDto> = {}): RoleDto {
  return {
    id: 'role-1',
    enterpriseId: 'ent-1',
    code: 'role',
    name: 'Role',
    permissionCodes: [],
    dataScopes: [],
    isSystem: false,
    status: 'active',
    ...overrides,
  };
}
