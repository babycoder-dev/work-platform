import { ConflictException, NotFoundException } from '@nestjs/common';
import type { CurrentUserDto, PlatformAuditPort } from '@work/platform-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryPresenceRepository } from '../db/in-memory-presence.repository';
import { PresenceStatusTypeService } from './presence-status-type.service';

describe('PresenceStatusTypeService', () => {
  let repository: InMemoryPresenceRepository;
  let auditService: PlatformAuditPort;
  let service: PresenceStatusTypeService;

  beforeEach(() => {
    repository = new InMemoryPresenceRepository();
    auditService = { record: vi.fn() };
    service = new PresenceStatusTypeService(repository, auditService);
  });

  it('lists presets and creates a tenant-scoped custom status with audit', async () => {
    expect(await service.listActive('ent-1')).toHaveLength(5);

    const created = await service.create(
      currentUser(),
      { key: 'vip_visit', label: '贵宾接待', sortOrder: 60 },
      {},
    );

    expect(created).toMatchObject({
      enterpriseId: 'ent-1',
      key: 'vip_visit',
      isPreset: false,
      isDefault: false,
      status: 'active',
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'presence.status-type.create',
        resourceType: 'presence.status_type',
        resourceId: created.id,
        result: 'success',
        metadata: expect.objectContaining({ key: 'vip_visit' }),
      }),
    );
  });

  it('rejects duplicate active or archived keys', async () => {
    const created = await service.create(
      currentUser(),
      { key: 'vip_visit', label: '贵宾接待' },
      {},
    );
    await service.archive(currentUser(), created.id, {});

    await expect(
      service.create(currentUser(), { key: 'vip_visit', label: '重复' }, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('moves default, protects it from archive, and restores archived statuses without defaulting them', async () => {
    const created = await service.create(
      currentUser(),
      { key: 'vip_visit', label: '贵宾接待' },
      {},
    );
    const defaulted = await service.setDefault(currentUser(), created.id, {});
    expect(defaulted.isDefault).toBe(true);
    await expect(service.archive(currentUser(), created.id, {})).rejects.toBeInstanceOf(
      ConflictException,
    );

    const trip = (await service.listAll('ent-1')).find((type) => type.key === 'business_trip')!;
    await service.archive(currentUser(), trip.id, {});
    const restored = await service.restore(currentUser(), trip.id, {});
    expect(restored).toMatchObject({ status: 'active', isDefault: false });
  });

  it('hides cross-tenant status ids as not found', async () => {
    const created = await service.create(
      currentUser(),
      { key: 'vip_visit', label: '贵宾接待' },
      {},
    );

    await expect(
      service.update(
        { ...currentUser(), enterpriseId: 'ent-2' },
        created.id,
        { label: '越权' },
        {},
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function currentUser(): CurrentUserDto {
  return {
    id: 'user-1',
    account: 'admin',
    employeeNo: 'E001',
    name: 'Admin',
    enterpriseId: 'ent-1',
    roles: ['admin'],
    permissions: [],
    dataScopes: { profile: ['company'], presence: ['company'], report: ['company'] },
    mustChangePassword: false,
  };
}
