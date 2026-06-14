import type { TriggerRecipient } from '@work/notification-contract';

export interface TriggerConfigRecord {
  triggerKey: string;
  enabled: boolean;
  defaultRecipients: TriggerRecipient[];
  updatedAt: Date;
}
