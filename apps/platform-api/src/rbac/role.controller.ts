import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import type { CreateRoleInput } from '@work/platform-contract';
import { RbacService } from './rbac.service';

@Controller('roles')
export class RoleController {
  constructor(@Inject(RbacService) private readonly rbacService: RbacService) {}

  @Get()
  listRoles() {
    return this.rbacService.listRoles();
  }

  @Post()
  createRole(@Body() input: CreateRoleInput) {
    return this.rbacService.createRole(input);
  }
}
