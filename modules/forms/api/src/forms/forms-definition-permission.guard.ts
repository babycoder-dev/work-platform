import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { resolveActiveFormSlot, type FormDefinitionPermissionAction } from '@work/forms-contract';
import type { RequestWithAuth } from '@work/nest-common';

const FORMS_DEFINITION_PERMISSION_ACTION = 'forms:definition-permission-action';

export function RequireFormsDefinitionPermission(action: FormDefinitionPermissionAction) {
  return SetMetadata(FORMS_DEFINITION_PERMISSION_ACTION, action);
}

@Injectable()
export class FormsDefinitionPermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const action = this.reflector.getAllAndOverride<FormDefinitionPermissionAction>(
      FORMS_DEFINITION_PERMISSION_ACTION,
      [context.getHandler(), context.getClass()],
    );
    if (!action) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth & { params?: Record<string, string> }>();
    const slotKey = request.params?.slotKey;
    const slot = slotKey ? resolveActiveFormSlot(slotKey) : undefined;
    if (!slot) {
      throw new NotFoundException('表单槽位不存在');
    }

    const required = slot.permissions[action];
    const granted = new Set(request.currentUser?.permissions.map((permission) => permission.code) ?? []);
    if (!granted.has(required)) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}
