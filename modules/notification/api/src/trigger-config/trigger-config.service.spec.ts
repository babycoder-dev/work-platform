import type { PlatformAuditPort } from '@work/platform-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TriggerConfigRepository } from '../db/trigger-config.repository';
import { TriggerConfigService } from './trigger-config.service';

describe('TriggerConfigService', () => {
  let repository: MockTriggerConfigRepository;
  let auditService: MockPlatformAuditPort;
  let service: TriggerConfigService;

  beforeEach(() => {
    repository = {
      listTriggerConfigs: vi.fn(),
      findTriggerConfig: vi.fn(),
      upsertTriggerConfig: vi.fn(),
    };
    auditService = {
      record: vi.fn(),
    };
    service = new TriggerConfigService(repository, auditService);
  });

  it('lists trigger configs as DTOs', async () => {
    repository.listTriggerConfigs.mockResolvedValue([
      {
        triggerKey: 'presence.status.changed',
        enabled: true,
        defaultRecipients: [{ kind: 'department_manager' }],
        updatedAt: new Date('2026-06-07T00:00:00.000Z'),
      },
    ]);

    await expect(service.list()).resolves.toEqual({
      items: [
        {
          triggerKey: 'presence.status.changed',
          enabled: true,
          defaultRecipients: [{ kind: 'department_manager' }],
          updatedAt: '2026-06-07T00:00:00.000Z',
        },
      ],
    });
  });

  it('upserts and audits trigger config changes', async () => {
    repository.findTriggerConfig.mockResolvedValue({
      triggerKey: 'presence.status.changed',
      enabled: true,
      defaultRecipients: [{ kind: 'department_manager' }],
      updatedAt: new Date('2026-06-07T00:00:00.000Z'),
    });
    repository.upsertTriggerConfig.mockResolvedValue({
      triggerKey: 'presence.status.changed',
      enabled: false,
      defaultRecipients: [{ kind: 'role', roleCode: 'hr' }],
      updatedAt: new Date('2026-06-08T00:00:00.000Z'),
    });

    await expect(
      service.upsert(
        'presence.status.changed',
        { enabled: false, defaultRecipients: [{ kind: 'role', roleCode: 'hr' }] },
        { id: 'admin-id', account: 'admin', employeeNo: '000001', name: 'Admin', enterpriseId: 'ent-1', permissions: [] },
        { traceId: 'trace-1', ip: '203.0.113.10', userAgent: 'vitest' },
      ),
    ).resolves.toMatchObject({ enabled: false });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-id',
        actorAccount: 'admin',
        action: 'notification.trigger-config.update',
        resourceType: 'notification.trigger_config',
        resourceId: 'presence.status.changed',
        result: 'success',
        metadata: expect.objectContaining({
          before: expect.objectContaining({ enabled: true }),
          after: expect.objectContaining({ enabled: false }),
        }),
      }),
    );
  });
});

type MockTriggerConfigRepository = {
  [K in keyof TriggerConfigRepository]: ReturnType<typeof vi.fn>;
};

interface MockPlatformAuditPort extends PlatformAuditPort {
  record: ReturnType<typeof vi.fn>;
}
