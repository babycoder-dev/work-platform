import { Body, Controller, Get, Inject, Param, Put, Req } from '@nestjs/common';
import { buildAuthAuditContext, dtoValidationPipe, RequirePermissions, type RequestWithAuth } from '@work/nest-common';
import { formsPermissions } from '@work/forms-contract';
import { currentUser, toActor } from './form-actor';
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
