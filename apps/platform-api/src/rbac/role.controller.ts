import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { dtoValidationPipe } from '@work/nest-common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import type { PlatformRequest } from '../auth/request-user';
import { buildPlatformAuditContext } from '../auth/request-user';
import { PermissionGuard } from './permission.guard';
import { CreateRoleDto } from './role.dto';
import { RequirePermissions } from './require-permissions.decorator';
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

  @Post()
  @RequirePermissions('platform:role:manage')
  createRole(@Body(dtoValidationPipe(CreateRoleDto)) input: CreateRoleDto, @Req() request: PlatformRequest) {
    return this.rbacService.createRole(input, buildPlatformAuditContext(request));
  }
}
