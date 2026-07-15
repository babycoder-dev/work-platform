import type { DepartmentDto, EmployeeDto } from '@work/platform-contract';
import { describe, expect, it, vi } from 'vitest';
import type { PlatformRepository } from '../repositories/platform.repository';
import { EmployeeLookupService } from './employee-lookup.service';

describe('EmployeeLookupService', () => {
  it('returns only same-tenant active employees with minimal department snapshots', async () => {
    const repository = {
      listDepartments: vi.fn(async () => [
        department({ id: 'dept-1', enterpriseId: 'ent-default', name: '研发部' }),
        department({ id: 'dept-other', enterpriseId: 'ent-other', name: '外部部门' }),
        department({
          id: 'dept-disabled',
          enterpriseId: 'ent-default',
          name: '停用部门',
          status: 'disabled',
        }),
      ]),
      listEmployees: vi.fn(async () => [
        employee({
          id: 'employee-1',
          enterpriseId: 'ent-default',
          departmentId: 'dept-1',
          status: 'active',
        }),
        employee({
          id: 'employee-2',
          enterpriseId: 'ent-default',
          departmentId: 'dept-disabled',
          status: 'active',
        }),
        employee({ id: 'employee-disabled', enterpriseId: 'ent-default', status: 'disabled' }),
        employee({ id: 'employee-other', enterpriseId: 'ent-other', departmentId: 'dept-other' }),
      ]),
    } as Pick<PlatformRepository, 'listDepartments' | 'listEmployees'> as PlatformRepository;

    const result = await new EmployeeLookupService(repository).listEmployeesByIds('ent-default', [
      'employee-1',
      'employee-2',
      'employee-disabled',
      'employee-other',
      'missing',
    ]);

    expect(result).toEqual([
      {
        id: 'employee-1',
        employeeNo: 'E001',
        name: 'employee-1',
        departmentId: 'dept-1',
        departmentName: '研发部',
      },
      {
        id: 'employee-2',
        employeeNo: 'E001',
        name: 'employee-2',
        departmentId: 'dept-disabled',
        departmentName: undefined,
      },
    ]);
  });

  it('does not hit repository for empty lookups', async () => {
    const repository = {
      listDepartments: vi.fn(),
      listEmployees: vi.fn(),
    } as Pick<PlatformRepository, 'listDepartments' | 'listEmployees'> as PlatformRepository;

    await expect(
      new EmployeeLookupService(repository).listEmployeesByIds('ent-default', []),
    ).resolves.toEqual([]);
    expect(repository.listDepartments).not.toHaveBeenCalled();
    expect(repository.listEmployees).not.toHaveBeenCalled();
  });

  it('does not hit repository for an empty department scope', async () => {
    const repository = {
      listDepartments: vi.fn(),
      listEmployees: vi.fn(),
    } as Pick<PlatformRepository, 'listDepartments' | 'listEmployees'> as PlatformRepository;

    await expect(
      new EmployeeLookupService(repository).listEmployeesByScope('ent-default', []),
    ).resolves.toEqual([]);
    expect(repository.listDepartments).not.toHaveBeenCalled();
    expect(repository.listEmployees).not.toHaveBeenCalled();
  });

  it('lists scoped active employee rosters without crossing tenant or status boundaries', async () => {
    const repository = {
      listDepartments: vi.fn(async () => [
        department({ id: 'dept-a', enterpriseId: 'ent-default', name: '研发部' }),
        department({ id: 'dept-b', enterpriseId: 'ent-default', name: '市场部' }),
        department({ id: 'dept-other', enterpriseId: 'ent-other', name: '外部部门' }),
      ]),
      listEmployees: vi.fn(async () => [
        employee({
          id: 'employee-a',
          enterpriseId: 'ent-default',
          employeeNo: 'E-A',
          departmentId: 'dept-a',
        }),
        employee({
          id: 'employee-b',
          enterpriseId: 'ent-default',
          employeeNo: 'E-B',
          departmentId: 'dept-b',
        }),
        employee({ id: 'employee-none', enterpriseId: 'ent-default', employeeNo: 'E-N' }),
        employee({
          id: 'employee-disabled',
          enterpriseId: 'ent-default',
          status: 'disabled',
          departmentId: 'dept-a',
        }),
        employee({ id: 'employee-other', enterpriseId: 'ent-other', departmentId: 'dept-other' }),
      ]),
    } as Pick<PlatformRepository, 'listDepartments' | 'listEmployees'> as PlatformRepository;
    const service = new EmployeeLookupService(repository);

    await expect(service.listEmployeesByScope('ent-default')).resolves.toEqual([
      {
        id: 'employee-a',
        employeeNo: 'E-A',
        name: 'employee-a',
        departmentId: 'dept-a',
        departmentName: '研发部',
      },
      {
        id: 'employee-b',
        employeeNo: 'E-B',
        name: 'employee-b',
        departmentId: 'dept-b',
        departmentName: '市场部',
      },
      {
        id: 'employee-none',
        employeeNo: 'E-N',
        name: 'employee-none',
        departmentId: undefined,
        departmentName: undefined,
      },
    ]);
    await expect(service.listEmployeesByScope('ent-default', ['dept-a'])).resolves.toEqual([
      {
        id: 'employee-a',
        employeeNo: 'E-A',
        name: 'employee-a',
        departmentId: 'dept-a',
        departmentName: '研发部',
      },
    ]);
    await expect(service.listEmployeesByScope('ent-default', [])).resolves.toEqual([]);
  });
});

function department(
  input: Partial<DepartmentDto> & Pick<DepartmentDto, 'id' | 'enterpriseId' | 'name'>,
): DepartmentDto {
  return {
    code: input.id,
    parentId: undefined,
    managerUserId: undefined,
    sortOrder: 0,
    status: 'active',
    ...input,
  };
}

function employee(
  input: Partial<EmployeeDto> & Pick<EmployeeDto, 'id' | 'enterpriseId'>,
): EmployeeDto {
  return {
    employeeNo: 'E001',
    name: input.id,
    account: `${input.id}@example.com`,
    departmentId: undefined,
    title: undefined,
    mobile: undefined,
    email: undefined,
    status: 'active',
    roleIds: [],
    mustChangePassword: false,
    ...input,
  };
}
