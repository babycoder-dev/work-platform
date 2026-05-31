import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { dtoValidationPipe, PermissionGuard, RequirePermissions } from '@work/nest-common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import type { PlatformRequest } from '../auth/request-user';
import { buildPlatformAuditContext } from '../auth/request-user';
import { CreateRoleDto, UpdateRoleDto } from './role.dto';
import { RbacService } from './rbac.service';

@Controller('roles')
@UseGuards(PlatformAuthGuard, PermissionGuard)
export class RoleController {
  constructor(@Inject(RbacService) private readonly rbacService: RbacService) {}

  @Get()
  @RequirePermissions('platform:role:view')
  listRoles() {
    return this.rbacService.listRoles();
  }

  @Get(':id')
  @RequirePermissions('platform:role:view')
  getRole(@Param('id') id: string) {
    return this.rbacService.getRole(id);
  }

  @Post()
  @RequirePermissions('platform:role:manage')
  createRole(@Body(dtoValidationPipe(CreateRoleDto)) input: CreateRoleDto, @Req() request: PlatformRequest) {
    return this.rbacService.createRole(
      {
        ...input,
        enterpriseId: request.currentUser!.enterpriseId,
      },
      buildPlatformAuditContext(request),
    );
  }

  @Patch(':id')
  @RequirePermissions('platform:role:manage')
  updateRole(
    @Param('id') id: string,
    @Body(dtoValidationPipe(UpdateRoleDto)) input: UpdateRoleDto,
    @Req() request: PlatformRequest,
  ) {
    return this.rbacService.updateRole(id, input, buildPlatformAuditContext(request));
  }

  @Delete(':id')
  @RequirePermissions('platform:role:manage')
  deleteRole(@Param('id') id: string, @Req() request: PlatformRequest) {
    return this.rbacService.deleteRole(id, buildPlatformAuditContext(request));
  }
}
