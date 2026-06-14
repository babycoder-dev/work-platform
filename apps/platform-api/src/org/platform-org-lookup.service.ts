import { Inject, Injectable } from '@nestjs/common';
import type { PlatformOrgPort } from '@work/platform-contract';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class PlatformOrgLookupService implements PlatformOrgPort {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async resolveDepartmentManager(
    enterpriseId: string,
    userId: string,
  ): Promise<{ managerUserId?: string }> {
    const employee = await this.repository.findEmployeeById(userId);
    if (
      !employee ||
      employee.enterpriseId !== enterpriseId ||
      employee.status !== 'active' ||
      employee.departmentId === undefined
    ) {
      return {};
    }

    const department = await this.repository.findDepartmentById(employee.departmentId);
    if (
      !department ||
      department.enterpriseId !== enterpriseId ||
      department.status !== 'active' ||
      department.managerUserId === undefined
    ) {
      return {};
    }

    const manager = await this.repository.findEmployeeById(department.managerUserId);
    if (!manager || manager.enterpriseId !== enterpriseId || manager.status !== 'active') {
      return {};
    }

    return { managerUserId: department.managerUserId };
  }

  async listUserIdsByRole(enterpriseId: string, roleCode: string): Promise<string[]> {
    const role = (await this.repository.listRoles(enterpriseId)).find(
      (item) => item.code === roleCode && item.status === 'active',
    );
    if (!role) {
      return [];
    }

    return Array.from(
      new Set(
        (await this.repository.listEmployees())
          .filter(
            (employee) =>
              employee.enterpriseId === enterpriseId &&
              employee.status === 'active' &&
              employee.roleIds.includes(role.id),
          )
          .map((employee) => employee.id),
      ),
    );
  }
}
