import { Controller, Get } from '@nestjs/common';
import { RbacService } from './rbac.service';

@Controller('permissions')
export class PermissionController {
  constructor(private readonly rbacService: RbacService) {}

  @Get()
  listPermissions() {
    return this.rbacService.listPermissions();
  }
}
