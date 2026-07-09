import { Inject, Injectable } from '@nestjs/common';
import { FormsService } from '@work/forms-api';
import type { CurrentUserDto } from '@work/platform-contract';
import type { PresenceFormsLinkCreateInput, PresenceFormsLinkPort } from '@work/presence-api';

@Injectable()
export class GatewayPresenceFormsLink implements PresenceFormsLinkPort {
  constructor(@Inject(FormsService) private readonly formsService: FormsService) {}

  async createStatusFormRecord(
    currentUser: CurrentUserDto,
    input: PresenceFormsLinkCreateInput,
    audit: { traceId?: string; ip?: string; userAgent?: string },
  ): Promise<{ recordId: string }> {
    const record = await this.formsService.createRecord(
      {
        enterpriseId: currentUser.enterpriseId,
        userId: currentUser.id,
        account: currentUser.account,
        permissionCodes: currentUser.permissions.map((permission) => permission.code),
      },
      currentUser,
      {
        slotKey: input.slotKey as `presence.status.${string}`,
        subjectType: 'employee',
        subjectId: currentUser.id,
        definitionRevision: input.definitionRevision,
        values: input.values,
      },
      audit,
    );
    return { recordId: record.id };
  }
}
