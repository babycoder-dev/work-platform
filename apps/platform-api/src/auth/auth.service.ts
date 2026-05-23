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
import { verifyPassword } from '../security/secret-hash';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface LoginAuditContext {
  traceId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly accessTokenTtlSeconds = 7200;

  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async login(input: LoginInput, auditContext: LoginAuditContext = {}): Promise<LoginResult> {
    const identity = await this.repository.findLocalIdentityByAccount(input.account);
    if (!identity) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const now = Date.now();
    const lockedUntilTime = identity.lockedUntil ? Date.parse(identity.lockedUntil) : undefined;
    if (lockedUntilTime !== undefined && lockedUntilTime > now) {
      const remainingMinutes = Math.max(1, Math.ceil((lockedUntilTime - now) / 60000));
      await this.repository.recordAuditLog({
        actorUserId: identity.userId,
        actorAccount: identity.account,
        action: 'auth.login',
        resourceType: 'platform.session',
        resourceId: identity.userId,
        traceId: auditContext.traceId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        result: 'failure',
        metadata: {
          reason: 'account_locked',
          remainingMinutes,
        },
      });
      throw new UnauthorizedException(`账号已被锁定，请 ${remainingMinutes} 分钟后重试`);
    }

    const employee = await this.repository.findEmployeeById(identity.userId);
    if (!employee || employee.status !== 'active') {
      await this.repository.recordAuditLog({
        actorUserId: identity.userId,
        actorAccount: identity.account,
        action: 'auth.login',
        resourceType: 'platform.session',
        resourceId: identity.userId,
        traceId: auditContext.traceId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        result: 'failure',
        metadata: {
          reason: 'employee_inactive',
        },
      });
      throw new UnauthorizedException('账号或密码错误');
    }

    if (!verifyPassword(input.password, identity.passwordHash)) {
      const isLockExpired = lockedUntilTime !== undefined && lockedUntilTime <= now;
      const baseFailedAttempts = isLockExpired ? 0 : identity.failedAttempts;
      const nextFailedAttempts = baseFailedAttempts + 1;
      const willLock = nextFailedAttempts >= MAX_FAILED_ATTEMPTS;
      const newLockedUntil = willLock ? new Date(now + LOCK_DURATION_MS).toISOString() : null;
      await this.repository.updateLocalIdentitySecurityState(identity.userId, {
        failedAttempts: nextFailedAttempts,
        lockedUntil: newLockedUntil,
      });
      await this.repository.recordAuditLog({
        actorUserId: identity.userId,
        actorAccount: identity.account,
        action: 'auth.login',
        resourceType: 'platform.session',
        resourceId: identity.userId,
        traceId: auditContext.traceId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        result: 'failure',
        metadata: {
          reason: 'wrong_password',
          failedAttempts: nextFailedAttempts,
          locked: willLock,
        },
      });

      if (willLock) {
        throw new UnauthorizedException('账号已被锁定，请 15 分钟后重试');
      }
      throw new UnauthorizedException('账号或密码错误');
    }

    await this.repository.updateLocalIdentitySecurityState(identity.userId, {
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(now).toISOString(),
    });
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
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
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
      lockDurationMinutes: 15,
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
    const roles = roleResults.filter((role): role is RoleDto => role !== undefined && role.status === 'active');
    const permissionCodes = new Set(roles.flatMap((role) => role.permissionCodes));
    const permissionResults = await Promise.all(
      Array.from(permissionCodes).map((code) => this.repository.findPermissionByCode(code)),
    );
    const permissions = permissionResults.filter((permission): permission is PermissionDto => permission !== undefined);

    return {
      id: employee.id,
      account: employee.account,
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
