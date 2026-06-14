import { Inject, Injectable } from '@nestjs/common';
import type { PlatformOrgPort } from '@work/platform-contract';
import { PLATFORM_ORG_PORT } from '@work/platform-contract';
import type { TriggerRecipient } from '@work/notification-contract';

export interface RecipientResolutionContext {
  enterpriseId: string;
  subjectUserId: string;
  actorUserId: string;
}

@Injectable()
export class RecipientResolver {
  constructor(@Inject(PLATFORM_ORG_PORT) private readonly platformOrgPort: PlatformOrgPort) {}

  async resolve(
    recipients: TriggerRecipient[],
    context: RecipientResolutionContext,
  ): Promise<string[]> {
    const resolved = new Set<string>();

    for (const recipient of recipients) {
      if (recipient.kind === 'department_manager') {
        const result = await this.platformOrgPort.resolveDepartmentManager(
          context.enterpriseId,
          context.subjectUserId,
        );
        if (result.managerUserId) {
          resolved.add(result.managerUserId);
        }
      } else if (recipient.kind === 'role') {
        if (!recipient.roleCode) {
          continue;
        }
        for (const userId of await this.platformOrgPort.listUserIdsByRole(
          context.enterpriseId,
          recipient.roleCode,
        )) {
          resolved.add(userId);
        }
      } else if (recipient.kind === 'subject') {
        resolved.add(context.subjectUserId);
      } else if (recipient.kind === 'self') {
        // Reserved for future trigger semantics; today actor self-notification is explicitly excluded.
        continue;
      }
    }

    resolved.delete(context.actorUserId);
    return Array.from(resolved);
  }
}
