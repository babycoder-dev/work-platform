import { Injectable } from '@nestjs/common';
import type { TriggerConfigRepository, UpsertTriggerConfigInput } from './trigger-config.repository';
import type { TriggerConfigRecord } from './schema/trigger-config.schema';

@Injectable()
export class InMemoryTriggerConfigRepository implements TriggerConfigRepository {
  private readonly records = new Map<string, TriggerConfigRecord>([
    [
      'presence.status.changed',
      {
        triggerKey: 'presence.status.changed',
        enabled: true,
        defaultRecipients: [{ kind: 'department_manager' }],
        updatedAt: new Date('2026-06-07T00:00:00.000Z'),
      },
    ],
  ]);

  async listTriggerConfigs(): Promise<TriggerConfigRecord[]> {
    return Array.from(this.records.values()).map(cloneRecord);
  }

  async findTriggerConfig(triggerKey: string): Promise<TriggerConfigRecord | undefined> {
    const record = this.records.get(triggerKey);
    return record ? cloneRecord(record) : undefined;
  }

  async upsertTriggerConfig(
    triggerKey: string,
    input: UpsertTriggerConfigInput,
  ): Promise<TriggerConfigRecord> {
    const existing = this.records.get(triggerKey);
    const updated: TriggerConfigRecord = {
      triggerKey,
      enabled: input.enabled ?? existing?.enabled ?? true,
      defaultRecipients: input.defaultRecipients ?? existing?.defaultRecipients ?? [],
      updatedAt: new Date(),
    };
    this.records.set(triggerKey, cloneRecord(updated));
    return cloneRecord(updated);
  }
}

function cloneRecord(record: TriggerConfigRecord): TriggerConfigRecord {
  return {
    ...record,
    defaultRecipients: record.defaultRecipients.map((recipient) => ({ ...recipient })),
    updatedAt: new Date(record.updatedAt),
  };
}
