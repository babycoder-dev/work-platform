import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE_METADATA } from './public.decorator';
import { REQUIRED_PERMISSIONS_METADATA } from './require-permissions.decorator';
import type { RequestWithAuth } from './request-with-auth';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const granted = new Set(request.currentUser?.permissions.map((permission) => permission.code) ?? []);
    const hasAllPermissions = required.every((permission) => granted.has(permission));
    if (!hasAllPermissions) {
      throw new ForbiddenException('权限不足');
    }

    return true;
  }
}
