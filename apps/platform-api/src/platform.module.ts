import { Module } from '@nestjs/common';
import { PermissionGuard } from '@work/nest-common';
import { PLATFORM_AUDIT_SERVICE, PLATFORM_SCOPE_SERVICE } from '@work/platform-contract';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { PlatformAuthGuard } from './auth/platform-auth.guard';
import { PlatformAuditService } from './audit/platform-audit.service';
import { DbModule } from './db/db.module';
import { DepartmentController } from './org/department.controller';
import { EnterpriseController } from './org/enterprise.controller';
import { OrgService } from './org/org.service';
import { PermissionController } from './rbac/permission.controller';
import { PLATFORM_REPOSITORY, type PlatformRepository } from './repositories/platform.repository';
import { PostgresPlatformRepository } from './repositories/postgres-platform.repository';
import { readPlatformRepositoryDriver } from './repositories/repository-driver.config';
import { MenuController } from './rbac/menu.controller';
import { ModuleManifestController } from './rbac/module-manifest.controller';
import { RoleController } from './rbac/role.controller';
import { RbacService } from './rbac/rbac.service';
import { PlatformScopeService } from './scope/platform-scope.service';
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
    MenuController,
    ModuleManifestController,
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
    PlatformScopeService,
    {
      provide: PLATFORM_SCOPE_SERVICE,
      useExisting: PlatformScopeService,
    },
    PlatformAuditService,
    {
      provide: PLATFORM_AUDIT_SERVICE,
      useExisting: PlatformAuditService,
    },
    PermissionGuard,
    RbacService,
  ],
  exports: [
    PlatformAuthGuard,
    PermissionGuard,
    AuthService,
    PLATFORM_SCOPE_SERVICE,
    PLATFORM_AUDIT_SERVICE,
  ],
})
export class PlatformModule {}
