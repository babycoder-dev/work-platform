import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { dtoValidationPipe } from '@work/nest-common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { CreateDepartmentDto } from './department.dto';
import { OrgService } from './org.service';

@Controller('departments')
@UseGuards(PlatformAuthGuard, PermissionGuard)
export class DepartmentController {
  constructor(@Inject(OrgService) private readonly orgService: OrgService) {}

  @Get()
  @RequirePermissions('platform:org:view')
  listDepartments() {
    return this.orgService.listDepartments();
  }

  @Post()
  @RequirePermissions('platform:org:manage')
  createDepartment(@Body(dtoValidationPipe(CreateDepartmentDto)) input: CreateDepartmentDto) {
    return this.orgService.createDepartment(input);
  }
}
