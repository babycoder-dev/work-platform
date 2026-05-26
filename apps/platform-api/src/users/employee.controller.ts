import { Body, Controller, Get, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { dtoValidationPipe, PermissionGuard, RequirePermissions } from '@work/nest-common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import type { PlatformRequest } from '../auth/request-user';
import { buildPlatformAuditContext } from '../auth/request-user';
import { AssignEmployeeRolesDto, CreateEmployeeDto, ResetEmployeePasswordDto, UpdateEmployeeStatusDto } from './employee.dto';
import { EmployeeService } from './employee.service';

@Controller('employees')
@UseGuards(PlatformAuthGuard, PermissionGuard)
export class EmployeeController {
  constructor(@Inject(EmployeeService) private readonly employeeService: EmployeeService) {}

  @Get()
  @RequirePermissions('platform:employee:view')
  listEmployees(@Req() request: PlatformRequest) {
    return this.employeeService.listEmployees(request.currentUser!);
  }

  @Post()
  @RequirePermissions('platform:employee:create')
  createEmployee(
    @Body(dtoValidationPipe(CreateEmployeeDto)) input: CreateEmployeeDto,
    @Req() request: PlatformRequest,
  ) {
    return this.employeeService.createEmployee(input, buildPlatformAuditContext(request));
  }

  @Put(':id/status')
  @RequirePermissions('platform:employee:manage')
  updateStatus(
    @Param('id') id: string,
    @Body(dtoValidationPipe(UpdateEmployeeStatusDto)) input: UpdateEmployeeStatusDto,
    @Req() request: PlatformRequest,
  ) {
    return this.employeeService.updateStatus(id, input, buildPlatformAuditContext(request));
  }

  @Put(':id/roles')
  @RequirePermissions('platform:role:manage')
  assignRoles(
    @Param('id') id: string,
    @Body(dtoValidationPipe(AssignEmployeeRolesDto)) input: AssignEmployeeRolesDto,
    @Req() request: PlatformRequest,
  ) {
    return this.employeeService.assignRoles(
      {
        userId: id,
        roleIds: input.roleIds,
      },
      buildPlatformAuditContext(request),
    );
  }

  @Put(':id/password')
  @RequirePermissions('platform:employee:manage')
  resetPassword(
    @Param('id') id: string,
    @Body(dtoValidationPipe(ResetEmployeePasswordDto)) input: ResetEmployeePasswordDto,
    @Req() request: PlatformRequest,
  ) {
    return this.employeeService.resetPassword(id, input, buildPlatformAuditContext(request));
  }
}
