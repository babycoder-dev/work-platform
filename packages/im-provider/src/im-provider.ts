import type {
  ImUserProfile,
  ImWebhookEvent,
  SendSystemMessageInput,
  SendSystemMessageResult,
} from './messages';

export interface ImProvider {
  syncUser(profile: ImUserProfile): Promise<void>;
  disableUser(userId: string): Promise<void>;
  sendSystemMessage(input: SendSystemMessageInput): Promise<SendSystemMessageResult>;
  handleWebhook(event: ImWebhookEvent): Promise<void>;
}
