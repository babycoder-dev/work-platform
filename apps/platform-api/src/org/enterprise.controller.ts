import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { OrgService } from './org.service';

@Controller('enterprises')
@UseGuards(PlatformAuthGuard, PermissionGuard)
export class EnterpriseController {
  constructor(@Inject(OrgService) private readonly orgService: OrgService) {}

  @Get()
  @RequirePermissions('platform:org:view')
  listEnterprises() {
    return this.orgService.listEnterprises();
  }
}
