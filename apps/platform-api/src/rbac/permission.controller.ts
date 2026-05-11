import { Controller, Get, Inject } from '@nestjs/common';
import { RbacService } from './rbac.service';

@Controller('permissions')
export class PermissionController {
  constructor(@Inject(RbacService) private readonly rbacService: RbacService) {}

  @Get()
  listPermissions() {
    return this.rbacService.listPermissions();
  }
}
