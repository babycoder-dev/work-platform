import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssignUserRolesInput,
  CreateEmployeeInput,
  EmployeeDto,
  UpdateEmployeeStatusInput,
} from '@work/platform-contract';
import { PlatformMemoryStore } from '../store/platform-memory.store';

@Injectable()
export class EmployeeService {
  constructor(private readonly store: PlatformMemoryStore) {}

  listEmployees() {
    return {
      items: this.store.listEmployees(),
    };
  }

  createEmployee(input: CreateEmployeeInput) {
    return this.store.createEmployee(input);
  }

  updateStatus(id: string, input: UpdateEmployeeStatusInput): EmployeeDto {
    const employee = this.store.findEmployeeById(id);
    if (!employee) {
      throw new NotFoundException('员工不存在');
    }

    const updated: EmployeeDto = {
      ...employee,
      status: input.status,
    };

    this.store.employees.set(id, updated);
    return updated;
  }

  assignRoles(input: AssignUserRolesInput) {
    const employee = this.store.setUserRoles(input.userId, input.roleIds);
    if (!employee) {
      throw new NotFoundException('员工不存在');
    }

    return employee;
  }
}
