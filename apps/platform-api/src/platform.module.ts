import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { PlatformAuthGuard } from './auth/platform-auth.guard';
import { DbModule } from './db/db.module';
import { DepartmentController } from './org/department.controller';
import { EnterpriseController } from './org/enterprise.controller';
import { OrgService } from './org/org.service';
import { PermissionController } from './rbac/permission.controller';
import { PermissionGuard } from './rbac/permission.guard';
import { PLATFORM_REPOSITORY, type PlatformRepository } from './repositories/platform.repository';
import { PostgresPlatformRepository } from './repositories/postgres-platform.repository';
import { readPlatformRepositoryDriver } from './repositories/repository-driver.config';
import { RoleController } from './rbac/role.controller';
import { RbacService } from './rbac/rbac.service';
import { PlatformMemoryStore } from './store/platform-memory.store';
import { HealthController } from './system/health.controller';
import { EmployeeController } from './users/employee.controller';
import { EmployeeService } from './users/employee.service';

@Module({
  imports: [DbModule],
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
    PostgresPlatformRepository,
    {
      provide: PLATFORM_REPOSITORY,
      useFactory: (
        memoryRepository: PlatformMemoryStore,
        postgresRepository: PostgresPlatformRepository,
      ): PlatformRepository => {
        return readPlatformRepositoryDriver() === 'postgres' ? postgresRepository : memoryRepository;
      },
      inject: [PlatformMemoryStore, PostgresPlatformRepository],
    },
    AuthService,
    PlatformAuthGuard,
    OrgService,
    EmployeeService,
    PermissionGuard,
    RbacService,
  ],
})
export class PlatformModule {}
