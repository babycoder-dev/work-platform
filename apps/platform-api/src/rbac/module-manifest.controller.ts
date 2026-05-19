import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PermissionGuard } from './permission.guard';
import { RequirePermissions } from './require-permissions.decorator';
import { RbacService } from './rbac.service';

@Controller('module-manifests')
@UseGuards(PlatformAuthGuard, PermissionGuard)
export class ModuleManifestController {
  constructor(@Inject(RbacService) private readonly rbacService: RbacService) {}

  @Get()
  @RequirePermissions('platform:permission:view')
  listModuleManifests() {
    return this.rbacService.listModuleManifests();
  }
}
