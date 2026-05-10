import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import type { AssignUserRolesInput, CreateEmployeeInput, UpdateEmployeeStatusInput } from '@work/platform-contract';
import { EmployeeService } from './employee.service';

@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  listEmployees() {
    return this.employeeService.listEmployees();
  }

  @Post()
  createEmployee(@Body() input: CreateEmployeeInput) {
    return this.employeeService.createEmployee(input);
  }

  @Put(':id/status')
  updateStatus(@Param('id') id: string, @Body() input: UpdateEmployeeStatusInput) {
    return this.employeeService.updateStatus(id, input);
  }

  @Put(':id/roles')
  assignRoles(@Param('id') id: string, @Body() input: Omit<AssignUserRolesInput, 'userId'>) {
    return this.employeeService.assignRoles({
      userId: id,
      roleIds: input.roleIds,
    });
  }
}
