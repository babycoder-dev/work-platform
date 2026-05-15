import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import { dtoValidationPipe } from '@work/nest-common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { AssignEmployeeRolesDto, CreateEmployeeDto, UpdateEmployeeStatusDto } from './employee.dto';
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
  createEmployee(@Body(dtoValidationPipe(CreateEmployeeDto)) input: CreateEmployeeDto) {
    return this.employeeService.createEmployee(input);
  }

  @Put(':id/status')
  @RequirePermissions('platform:employee:manage')
  updateStatus(
    @Param('id') id: string,
    @Body(dtoValidationPipe(UpdateEmployeeStatusDto)) input: UpdateEmployeeStatusDto,
  ) {
    return this.employeeService.updateStatus(id, input);
  }

  @Put(':id/roles')
  @RequirePermissions('platform:role:manage')
  assignRoles(
    @Param('id') id: string,
    @Body(dtoValidationPipe(AssignEmployeeRolesDto)) input: AssignEmployeeRolesDto,
  ) {
    return this.employeeService.assignRoles({
      userId: id,
      roleIds: input.roleIds,
    });
  }
}
