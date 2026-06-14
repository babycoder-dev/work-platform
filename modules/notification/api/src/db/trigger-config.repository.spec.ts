import { describe, expect, it } from 'vitest';
import { InMemoryTriggerConfigRepository } from './in-memory-trigger-config.repository';

describe('InMemoryTriggerConfigRepository', () => {
  it('seeds, finds and upserts trigger configs', async () => {
    const repository = new InMemoryTriggerConfigRepository();

    await expect(repository.findTriggerConfig('presence.status.changed')).resolves.toMatchObject({
      triggerKey: 'presence.status.changed',
      enabled: true,
      defaultRecipients: [{ kind: 'department_manager' }],
    });

    await repository.upsertTriggerConfig('presence.status.changed', {
      enabled: false,
      defaultRecipients: [{ kind: 'role', roleCode: 'hr' }],
    });

    await expect(repository.listTriggerConfigs()).resolves.toEqual([
      expect.objectContaining({
        triggerKey: 'presence.status.changed',
        enabled: false,
        defaultRecipients: [{ kind: 'role', roleCode: 'hr' }],
      }),
    ]);
  });
});
