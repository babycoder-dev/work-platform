import { Inject, Injectable } from '@nestjs/common';
import type { CreateRoleInput, CurrentUserDto } from '@work/platform-contract';
import type { PlatformAuditContext } from '../auth/request-user';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class RbacService {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async listPermissions() {
    return {
      items: await this.repository.listPermissions(),
    };
  }

  async listCurrentUserMenus(currentUser: CurrentUserDto) {
    return {
      items: await this.repository.listMenusByPermissionCodes(
        currentUser.permissions.map((permission) => permission.code),
      ),
    };
  }

  async listModuleManifests() {
    return {
      items: await this.repository.listActiveModuleManifests(),
    };
  }

  async listRoles() {
    return {
      items: await this.repository.listRoles(),
    };
  }

  async createRole(input: CreateRoleInput, auditContext: PlatformAuditContext = {}) {
    const role = await this.repository.createRole(input);
    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action: 'platform.role.create',
      resourceType: 'platform.role',
      resourceId: role.id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        enterpriseId: role.enterpriseId,
        code: role.code,
        permissionCodes: role.permissionCodes,
        dataScopes: role.dataScopes,
      },
    });

    return role;
  }
}
