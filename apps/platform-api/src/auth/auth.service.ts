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
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  login(input: LoginInput): LoginResult {
    const employee = this.repository.validatePassword(input.account, input.password);
    if (!employee || employee.status !== 'active') {
      throw new UnauthorizedException('账号或密码错误');
    }

    return {
      accessToken: `dev-access-${randomUUID()}`,
      refreshToken: `dev-refresh-${randomUUID()}`,
      expiresIn: 7200,
      user: this.toCurrentUser(employee.id),
    };
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

  toCurrentUser(userId: string): CurrentUserDto {
    const employee = this.repository.findEmployeeById(userId);
    if (!employee) {
      throw new UnauthorizedException('用户不存在');
    }

    const department = employee.departmentId
      ? this.repository.findDepartmentById(employee.departmentId)
      : undefined;
    const roles = employee.roleIds
      .map((roleId) => this.repository.findRoleById(roleId))
      .filter((role): role is RoleDto => role !== undefined);
    const permissionCodes = new Set(roles.flatMap((role) => role.permissionCodes));
    const permissions = Array.from(permissionCodes)
      .map((code) => this.repository.findPermissionByCode(code))
      .filter((permission): permission is PermissionDto => permission !== undefined);

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
