import { BadRequestException } from '@nestjs/common';
import type { RequestWithAuth } from '@work/nest-common';
import type { FormActorContext } from '@work/forms-contract';
import type { CurrentUserDto } from '@work/platform-contract';

export function currentUser(request: RequestWithAuth): CurrentUserDto {
  if (!request.currentUser) {
    throw new BadRequestException('缺少认证用户');
  }
  return request.currentUser as CurrentUserDto;
}

export function toActor(request: RequestWithAuth): FormActorContext {
  const user = currentUser(request);
  return {
    enterpriseId: user.enterpriseId,
    userId: user.id,
    account: user.account,
    permissionCodes: user.permissions.map((permission) => permission.code),
  };
}
