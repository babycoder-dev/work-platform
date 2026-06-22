import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { dtoValidationPipe, PermissionGuard, RequirePermissions } from '@work/nest-common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import type { PlatformRequest } from '../auth/request-user';
import { buildPlatformAuditContext } from '../auth/request-user';
import { parseStatusLogListQuery } from '../status-log/status-log.dto';
import { StatusLogService } from '../status-log/status-log.service';
import {
  AssignEmployeeRolesDto,
  CreateEmployeeDto,
  UpdateEmployeeProfileDto,
  ResetEmployeePasswordDto,
  UpdateEmployeeStatusDto,
  UpdateMyProfileDto,
} from './employee.dto';
import { EmployeeService } from './employee.service';

@Controller('employees')
@UseGuards(PlatformAuthGuard, PermissionGuard)
export class EmployeeController {
  constructor(
    @Inject(EmployeeService) private readonly employeeService: EmployeeService,
    @Inject(StatusLogService) private readonly statusLogService: StatusLogService,
  ) {}

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
    return this.employeeService.createEmployee(
      {
        ...input,
        enterpriseId: request.currentUser!.enterpriseId,
      },
      buildPlatformAuditContext(request),
    );
  }

  @Get('me')
  getMyProfile(@Req() request: PlatformRequest) {
    return this.employeeService.getMyProfile(request.currentUser!);
  }

  @Put('me/profile')
  updateMyProfile(
    @Body(dtoValidationPipe(UpdateMyProfileDto)) input: UpdateMyProfileDto,
    @Req() request: PlatformRequest,
  ) {
    return this.employeeService.updateEmployeeProfile(
      request.currentUser!.id,
      input,
      'self',
      request.currentUser!,
      buildPlatformAuditContext(request),
    );
  }

  @Get(':id/status-logs')
  @RequirePermissions('platform:employee:view')
  listStatusLogs(
    @Param('id') id: string,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Req() request: PlatformRequest,
  ) {
    return this.statusLogService.listStatusLogs(
      id,
      parseStatusLogListQuery(limit, offset),
      request.currentUser!,
    );
  }

  @Get(':id')
  @RequirePermissions('platform:employee:view')
  getEmployee(@Param('id') id: string, @Req() request: PlatformRequest) {
    return this.employeeService.getEmployeeById(id, request.currentUser!);
  }

  @Put(':id/profile')
  @RequirePermissions('platform:employee:manage')
  updateEmployeeProfile(
    @Param('id') id: string,
    @Body(dtoValidationPipe(UpdateEmployeeProfileDto)) input: UpdateEmployeeProfileDto,
    @Req() request: PlatformRequest,
  ) {
    return this.employeeService.updateEmployeeProfile(
      id,
      input,
      'management',
      request.currentUser!,
      buildPlatformAuditContext(request),
    );
  }

  @Put(':id/status')
  @RequirePermissions('platform:employee:manage')
  updateStatus(
    @Param('id') id: string,
    @Body(dtoValidationPipe(UpdateEmployeeStatusDto)) input: UpdateEmployeeStatusDto,
    @Req() request: PlatformRequest,
  ) {
    return this.employeeService.updateStatus(
      id,
      input,
      request.currentUser!.enterpriseId,
      buildPlatformAuditContext(request),
    );
  }

  @Put(':id/roles')
  @RequirePermissions('platform:role:assign')
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
      request.currentUser!.enterpriseId,
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
    return this.employeeService.resetPassword(
      id,
      input,
      request.currentUser!.enterpriseId,
      buildPlatformAuditContext(request),
    );
  }
}
