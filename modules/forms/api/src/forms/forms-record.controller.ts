import { BadRequestException, Body, Controller, Get, Inject, Param, Put, Req } from '@nestjs/common';
import { buildAuthAuditContext, dtoValidationPipe, RequirePermissions, type RequestWithAuth } from '@work/nest-common';
import { formsPermissions, type FormActorContext } from '@work/forms-contract';
import type { CurrentUserDto } from '@work/platform-contract';
import { UpsertProfileRecordDto } from './forms.dto';
import { FormsService } from './forms.service';

@Controller('forms/records')
export class FormsRecordController {
  constructor(@Inject(FormsService) private readonly formsService: FormsService) {}

  @Get(':slotKey/subjects/:subjectId')
  @RequirePermissions(formsPermissions.recordView)
  getRecordBySubject(
    @Param('slotKey') slotKey: string,
    @Param('subjectId') subjectId: string,
    @Req() request: RequestWithAuth,
  ) {
    return this.formsService.getRecordBySubject(toActor(request), currentUser(request), {
      slotKey,
      subjectType: 'employee',
      subjectId,
    });
  }

  @Put(':slotKey/subjects/:subjectId')
  @RequirePermissions(formsPermissions.recordSubmit)
  upsertRecordBySubject(
    @Param('slotKey') slotKey: string,
    @Param('subjectId') subjectId: string,
    @Body(dtoValidationPipe(UpsertProfileRecordDto)) input: UpsertProfileRecordDto,
    @Req() request: RequestWithAuth,
  ) {
    return this.formsService.upsertRecordBySubject(
      toActor(request),
      currentUser(request),
      {
        slotKey,
        subjectType: 'employee',
        subjectId,
        definitionRevision: input.definitionRevision,
        values: input.values,
      },
      buildAuthAuditContext(request),
    );
  }
}

function currentUser(request: RequestWithAuth): CurrentUserDto {
  if (!request.currentUser) {
    throw new BadRequestException('缺少认证用户');
  }
  return request.currentUser as CurrentUserDto;
}

function toActor(request: RequestWithAuth): FormActorContext {
  const user = currentUser(request);
  return {
    enterpriseId: user.enterpriseId,
    userId: user.id,
    account: user.account,
    permissionCodes: user.permissions.map((permission) => permission.code),
  };
}
