import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermissions } from '@work/nest-common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
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
