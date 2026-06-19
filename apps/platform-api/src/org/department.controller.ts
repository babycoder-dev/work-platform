import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { dtoValidationPipe, PermissionGuard, RequirePermissions } from '@work/nest-common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import type { PlatformRequest } from '../auth/request-user';
import { buildPlatformAuditContext } from '../auth/request-user';
import { CreateDepartmentDto, UpdateDepartmentDto } from './department.dto';
import { OrgService } from './org.service';

@Controller('departments')
@UseGuards(PlatformAuthGuard, PermissionGuard)
export class DepartmentController {
  constructor(@Inject(OrgService) private readonly orgService: OrgService) {}

  @Get()
  @RequirePermissions('platform:org:view')
  listDepartments(@Req() request: PlatformRequest) {
    return this.orgService.listDepartments(currentEnterpriseId(request));
  }

  @Post()
  @RequirePermissions('platform:org:manage')
  createDepartment(
    @Body(dtoValidationPipe(CreateDepartmentDto)) input: CreateDepartmentDto,
    @Req() request: PlatformRequest,
  ) {
    return this.orgService.createDepartment(
      {
        ...input,
        enterpriseId: currentEnterpriseId(request),
      },
      buildPlatformAuditContext(request),
    );
  }

  @Put(':id')
  @RequirePermissions('platform:org:manage')
  updateDepartment(
    @Param('id') id: string,
    @Body(dtoValidationPipe(UpdateDepartmentDto)) input: UpdateDepartmentDto,
    @Req() request: PlatformRequest,
  ) {
    return this.orgService.updateDepartment(
      id,
      input,
      currentEnterpriseId(request),
      buildPlatformAuditContext(request),
    );
  }

  @Delete(':id')
  @RequirePermissions('platform:org:manage')
  deleteDepartment(@Param('id') id: string, @Req() request: PlatformRequest) {
    return this.orgService.deleteDepartment(
      id,
      currentEnterpriseId(request),
      buildPlatformAuditContext(request),
    );
  }
}

function currentEnterpriseId(request: PlatformRequest): string {
  const currentUser = request.currentUser;
  if (!currentUser) {
    throw new Error('PlatformAuthGuard did not attach currentUser');
  }
  return currentUser.enterpriseId;
}
