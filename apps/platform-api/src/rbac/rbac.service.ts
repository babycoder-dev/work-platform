import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ApiError } from '@work/errors';
import type { CreateRoleInput, CurrentUserDto, RoleDataScope, UpdateRoleInput } from '@work/platform-contract';
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

  async listRoles(enterpriseId: string) {
    return {
      items: await this.repository.listRoles(enterpriseId),
    };
  }

  async getRole(id: string, enterpriseId: string) {
    const role = await this.repository.findRoleById(id);
    if (!role || role.enterpriseId !== enterpriseId) {
      throw new NotFoundException('角色不存在');
    }
    return role;
  }

  async createRole(input: CreateRoleInput, auditContext: PlatformAuditContext = {}) {
    this.assertUniqueDataTypes(input.dataScopes);
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

  async updateRole(id: string, input: UpdateRoleInput, enterpriseId: string, auditContext: PlatformAuditContext = {}) {
    let updatedRole;
    try {
      const role = await this.getRole(id, enterpriseId);
      this.assertRoleMutable(role.isSystem);
      if (input.dataScopes !== undefined) {
        this.assertUniqueDataTypes(input.dataScopes);
      }
      updatedRole = await this.repository.updateRole(id, input, enterpriseId);
      if (!updatedRole) {
        throw new NotFoundException('角色不存在');
      }
    } catch (error) {
      await this.recordFailureAudit('platform.role.update', id, auditContext);
      throw error;
    }
    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action: 'platform.role.update',
      resourceType: 'platform.role',
      resourceId: id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        roleId: id,
        ...input,
      },
    });
    return updatedRole;
  }

  async deleteRole(id: string, enterpriseId: string, auditContext: PlatformAuditContext = {}) {
    let role;
    try {
      role = await this.getRole(id, enterpriseId);
      this.assertRoleMutable(role.isSystem);
      if (await this.repository.countUsersWithRole(id) > 0) {
        throw new ApiError('PLATFORM_ROLE_IN_USE', '角色仍被用户占用，无法删除', { status: 409 });
      }
      if (!await this.repository.deleteRole(id, enterpriseId)) {
        throw new NotFoundException('角色不存在');
      }
    } catch (error) {
      await this.recordFailureAudit('platform.role.delete', id, auditContext);
      throw error;
    }
    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action: 'platform.role.delete',
      resourceType: 'platform.role',
      resourceId: id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        roleId: id,
        code: role.code,
      },
    });
    return { success: true };
  }

  private assertUniqueDataTypes(dataScopes: RoleDataScope[]) {
    const dataTypes = new Set<string>();
    for (const { dataType } of dataScopes) {
      if (dataTypes.has(dataType)) {
        throw new BadRequestException('同一数据类型不可重复配置');
      }
      dataTypes.add(dataType);
    }
  }

  private assertRoleMutable(isSystem: boolean) {
    if (isSystem) {
      throw new ApiError('PLATFORM_ROLE_PROTECTED', '内置角色不可修改或删除', { status: 409 });
    }
  }

  private async recordFailureAudit(action: string, resourceId: string, auditContext: PlatformAuditContext) {
    await this.repository.recordAuditLog({
      actorUserId: auditContext.actorUserId,
      actorAccount: auditContext.actorAccount,
      action,
      resourceType: 'platform.role',
      resourceId,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'failure',
      metadata: {
        reason: 'request_rejected',
      },
    });
  }
}
