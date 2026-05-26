import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermissions } from '@work/nest-common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
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
