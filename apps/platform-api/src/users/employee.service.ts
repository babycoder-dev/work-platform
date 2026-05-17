import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssignUserRolesInput,
  CreateEmployeeInput,
  EmployeeDto,
  UpdateEmployeeStatusInput,
} from '@work/platform-contract';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class EmployeeService {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async listEmployees() {
    return {
      items: await this.repository.listEmployees(),
    };
  }

  async createEmployee(input: CreateEmployeeInput) {
    return this.repository.createEmployee(input);
  }

  async updateStatus(id: string, input: UpdateEmployeeStatusInput): Promise<EmployeeDto> {
    const employee = await this.repository.findEmployeeById(id);
    if (!employee) {
      throw new NotFoundException('员工不存在');
    }

    const updated: EmployeeDto = {
      ...employee,
      status: input.status,
    };

    return this.repository.updateEmployee(updated);
  }

  async assignRoles(input: AssignUserRolesInput) {
    const employee = await this.repository.setUserRoles(input.userId, input.roleIds);
    if (!employee) {
      throw new NotFoundException('员工不存在');
    }

    return employee;
  }
}
