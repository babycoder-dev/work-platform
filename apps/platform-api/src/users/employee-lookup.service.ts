import { Inject, Injectable } from '@nestjs/common';
import type { EmployeeLookupDto, PlatformEmployeeLookupPort } from '@work/platform-contract';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class EmployeeLookupService implements PlatformEmployeeLookupPort {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async listEmployeesByIds(enterpriseId: string, ids: string[]): Promise<EmployeeLookupDto[]> {
    if (ids.length === 0) {
      return [];
    }
    const requested = new Set(ids);
    const departments = new Map(
      (await this.repository.listDepartments(enterpriseId))
        .filter((department) => department.status === 'active')
        .map((department) => [department.id, department.name]),
    );
    return (await this.repository.listEmployees())
      .filter(
        (employee) =>
          requested.has(employee.id) &&
          employee.enterpriseId === enterpriseId &&
          employee.status === 'active',
      )
      .map((employee) => ({
        id: employee.id,
        employeeNo: employee.employeeNo,
        name: employee.name,
        departmentId: employee.departmentId,
        departmentName: employee.departmentId ? departments.get(employee.departmentId) : undefined,
      }));
  }
}
