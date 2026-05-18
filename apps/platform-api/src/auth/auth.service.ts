import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CurrentUserDto,
  LoginInput,
  LoginResult,
  PasswordPolicyDto,
  PermissionDto,
  RoleDto,
} from '@work/platform-contract';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class AuthService {
  private readonly accessTokenTtlSeconds = 7200;

  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const employee = await this.repository.validatePassword(input.account, input.password);
    if (!employee || employee.status !== 'active') {
      throw new UnauthorizedException('账号或密码错误');
    }

    const accessToken = `dev-access-${randomUUID()}`;
    await this.repository.createAccessSession({
      accessToken,
      userId: employee.id,
      expiresAt: new Date(Date.now() + this.accessTokenTtlSeconds * 1000).toISOString(),
    });
    await this.repository.recordAuditLog({
      actorUserId: employee.id,
      actorAccount: employee.account,
      action: 'auth.login',
      resourceType: 'platform.session',
      resourceId: employee.id,
      result: 'success',
      metadata: {
        account: employee.account,
      },
    });

    return {
      accessToken,
      expiresIn: this.accessTokenTtlSeconds,
      user: await this.toCurrentUser(employee.id),
    };
  }

  async authenticateAccessToken(accessToken: string): Promise<CurrentUserDto> {
    const session = await this.repository.findAccessSession(accessToken);
    if (!session) {
      throw new UnauthorizedException('登录状态无效');
    }

    if (Date.parse(session.expiresAt) <= Date.now()) {
      throw new UnauthorizedException('登录状态已过期');
    }

    return this.toCurrentUser(session.userId);
  }

  getPasswordPolicy(): PasswordPolicyDto {
    return {
      minLength: 8,
      requireNumber: true,
      requireUppercase: false,
      requireSpecialChar: false,
      maxFailedAttempts: 5,
      expireDays: 90,
    };
  }

  async toCurrentUser(userId: string): Promise<CurrentUserDto> {
    const employee = await this.repository.findEmployeeById(userId);
    if (!employee) {
      throw new UnauthorizedException('用户不存在');
    }

    const department = employee.departmentId
      ? await this.repository.findDepartmentById(employee.departmentId)
      : undefined;
    const roleResults = await Promise.all(employee.roleIds.map((roleId) => this.repository.findRoleById(roleId)));
    const roles = roleResults.filter((role): role is RoleDto => role !== undefined);
    const permissionCodes = new Set(roles.flatMap((role) => role.permissionCodes));
    const permissionResults = await Promise.all(
      Array.from(permissionCodes).map((code) => this.repository.findPermissionByCode(code)),
    );
    const permissions = permissionResults.filter((permission): permission is PermissionDto => permission !== undefined);

    return {
      id: employee.id,
      employeeNo: employee.employeeNo,
      name: employee.name,
      enterpriseId: employee.enterpriseId,
      departmentId: employee.departmentId,
      departmentName: department?.name,
      roles: roles.map((role) => role.code),
      permissions,
      dataScopes: roles.map((role) => role.dataScope),
    };
  }
}
