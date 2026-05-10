import { Body, Controller, Get, Post } from '@nestjs/common';
import type { CreateRoleInput } from '@work/platform-contract';
import { RbacService } from './rbac.service';

@Controller('roles')
export class RoleController {
  constructor(private readonly rbacService: RbacService) {}

  @Get()
  listRoles() {
    return this.rbacService.listRoles();
  }

  @Post()
  createRole(@Body() input: CreateRoleInput) {
    return this.rbacService.createRole(input);
  }
}
