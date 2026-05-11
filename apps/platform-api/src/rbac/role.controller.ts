import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import type { CreateRoleInput } from '@work/platform-contract';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PermissionGuard } from './permission.guard';
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
  createRole(@Body() input: CreateRoleInput) {
    return this.rbacService.createRole(input);
  }
}
