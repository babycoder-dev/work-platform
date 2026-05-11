import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PermissionGuard } from './permission.guard';
import { RequirePermissions } from './require-permissions.decorator';
import { RbacService } from './rbac.service';

@Controller('permissions')
@UseGuards(PlatformAuthGuard, PermissionGuard)
export class PermissionController {
  constructor(@Inject(RbacService) private readonly rbacService: RbacService) {}

  @Get()
  @RequirePermissions('platform:permission:view')
  listPermissions() {
    return this.rbacService.listPermissions();
  }
}
