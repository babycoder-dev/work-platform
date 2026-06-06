import { BadRequestException, Body, Controller, Get, Inject, Param, Put, Req, UseGuards } from '@nestjs/common';
import { buildAuthAuditContext, dtoValidationPipe, type RequestWithAuth } from '@work/nest-common';
import { type FormActorContext, type FormSlotKey } from '@work/forms-contract';
import {
  FormsDefinitionPermissionGuard,
  RequireFormsDefinitionPermission,
} from './forms-definition-permission.guard';
import { UpdateFormDefinitionDto } from './forms.dto';
import { FormsService } from './forms.service';

@Controller('forms/definitions')
@UseGuards(FormsDefinitionPermissionGuard)
export class FormsDefinitionController {
  constructor(@Inject(FormsService) private readonly formsService: FormsService) {}

  @Get(':slotKey')
  @RequireFormsDefinitionPermission('view')
  getDefinition(@Param('slotKey') slotKey: string, @Req() request: RequestWithAuth) {
    return this.formsService.getDefinition(toActor(request), slotKey as FormSlotKey);
  }

  @Put(':slotKey')
  @RequireFormsDefinitionPermission('manage')
  updateDefinition(
    @Param('slotKey') slotKey: string,
    @Body(dtoValidationPipe(UpdateFormDefinitionDto)) input: UpdateFormDefinitionDto,
    @Req() request: RequestWithAuth,
  ) {
    return this.formsService.updateDefinition(
      toActor(request),
      slotKey as FormSlotKey,
      input,
      buildAuthAuditContext(request),
    );
  }
}

function toActor(request: RequestWithAuth): FormActorContext {
  const currentUser = request.currentUser;
  if (!currentUser) {
    throw new BadRequestException('缺少认证用户');
  }
  return {
    enterpriseId: currentUser.enterpriseId,
    userId: currentUser.id,
    account: currentUser.account,
    permissionCodes: currentUser.permissions.map((permission) => permission.code),
  };
}
