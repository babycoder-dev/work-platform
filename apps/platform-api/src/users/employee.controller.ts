import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { AssignUserRolesInput, CreateEmployeeInput, UpdateEmployeeStatusInput } from '@work/platform-contract';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { EmployeeService } from './employee.service';

@Controller('employees')
@UseGuards(PlatformAuthGuard, PermissionGuard)
export class EmployeeController {
  constructor(@Inject(EmployeeService) private readonly employeeService: EmployeeService) {}

  @Get()
  @RequirePermissions('platform:employee:view')
  listEmployees() {
    return this.employeeService.listEmployees();
  }

  @Post()
  @RequirePermissions('platform:employee:create')
  createEmployee(@Body() input: CreateEmployeeInput) {
    return this.employeeService.createEmployee(input);
  }

  @Put(':id/status')
  @RequirePermissions('platform:employee:manage')
  updateStatus(@Param('id') id: string, @Body() input: UpdateEmployeeStatusInput) {
    return this.employeeService.updateStatus(id, input);
  }

  @Put(':id/roles')
  @RequirePermissions('platform:role:manage')
  assignRoles(@Param('id') id: string, @Body() input: Omit<AssignUserRolesInput, 'userId'>) {
    return this.employeeService.assignRoles({
      userId: id,
      roleIds: input.roleIds,
    });
  }
}
