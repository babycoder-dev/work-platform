import type { TriggerRecipient } from '@work/notification-contract';
import type { TriggerConfigRecord } from './schema/trigger-config.schema';

export interface UpsertTriggerConfigInput {
  enabled?: boolean;
  defaultRecipients?: TriggerRecipient[];
}

export interface TriggerConfigRepository {
  listTriggerConfigs(): Promise<TriggerConfigRecord[]>;
  findTriggerConfig(triggerKey: string): Promise<TriggerConfigRecord | undefined>;
  upsertTriggerConfig(
    triggerKey: string,
    input: UpsertTriggerConfigInput,
  ): Promise<TriggerConfigRecord>;
}
