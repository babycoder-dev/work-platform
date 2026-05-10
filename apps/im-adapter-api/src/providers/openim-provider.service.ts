import { Injectable } from '@nestjs/common';
import type {
  ImProvider,
  ImUserProfile,
  ImWebhookEvent,
  SendSystemMessageInput,
  SendSystemMessageResult,
} from '@work/im-provider';

@Injectable()
export class OpenImProviderService implements ImProvider {
  async syncUser(_profile: ImUserProfile): Promise<void> {
    // TODO: call OpenIM user import/create API.
  }

  async disableUser(_userId: string): Promise<void> {
    // TODO: call OpenIM user block/disable API.
  }

  async sendSystemMessage(input: SendSystemMessageInput): Promise<SendSystemMessageResult> {
    // TODO: call OpenIM admin REST API after POC deployment is available.
    return {
      acceptedUserIds: input.toUserIds,
    };
  }

  async handleWebhook(_event: ImWebhookEvent): Promise<void> {
    // TODO: verify OpenIM webhook signature and write audit log.
  }
}
