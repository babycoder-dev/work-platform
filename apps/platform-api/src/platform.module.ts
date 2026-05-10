import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { DepartmentController } from './org/department.controller';
import { EnterpriseController } from './org/enterprise.controller';
import { OrgService } from './org/org.service';
import { PermissionController } from './rbac/permission.controller';
import { PLATFORM_REPOSITORY } from './repositories/platform.repository';
import { RoleController } from './rbac/role.controller';
import { RbacService } from './rbac/rbac.service';
import { PlatformMemoryStore } from './store/platform-memory.store';
import { HealthController } from './system/health.controller';
import { EmployeeController } from './users/employee.controller';
import { EmployeeService } from './users/employee.service';

@Module({
  controllers: [
    HealthController,
    AuthController,
    EnterpriseController,
    DepartmentController,
    EmployeeController,
    PermissionController,
    RoleController,
  ],
  providers: [
    PlatformMemoryStore,
    {
      provide: PLATFORM_REPOSITORY,
      useExisting: PlatformMemoryStore,
    },
    AuthService,
    OrgService,
    EmployeeService,
    RbacService,
  ],
})
export class PlatformModule {}
