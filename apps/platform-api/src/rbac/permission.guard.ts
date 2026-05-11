import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlatformRequest } from '../auth/request-user';
import { REQUIRED_PERMISSIONS_METADATA } from './require-permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const granted = new Set(request.currentUser?.permissions.map((permission) => permission.code) ?? []);
    const hasAllPermissions = required.every((permission) => granted.has(permission));
    if (!hasAllPermissions) {
      throw new ForbiddenException('权限不足');
    }

    return true;
  }
}
