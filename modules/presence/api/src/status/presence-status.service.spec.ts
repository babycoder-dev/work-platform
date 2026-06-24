import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { EventBus } from '@work/event-bus';
import type { CurrentUserDto, PlatformAuditPort, PlatformScopePort } from '@work/platform-contract';
import type { PresenceStatusRecordDto } from '@work/presence-contract';
import { presenceEvents, presencePermissions } from '@work/presence-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresenceRepository } from '../db/presence.repository';
import { PresenceStatusService } from './presence-status.service';

describe('PresenceStatusService', () => {
  let repository: MockPresenceRepository;
  let scopeService: MockPlatformScopePort;
  let auditService: MockPlatformAuditPort;
  let eventBus: MockEventBus;
  let service: PresenceStatusService;

  beforeEach(() => {
    repository = createRepositoryMock();
    scopeService = {
      resolveScope: vi.fn(),
      matchesScope: vi.fn(),
    };
    auditService = {
      record: vi.fn(),
    };
    eventBus = {
      publish: vi.fn(async (event) => ({
        ...event,
        id: 'event-001',
        occurredAt: '2026-05-25T00:00:00.000Z',
      })),
      subscribe: vi.fn(),
    };
    service = new PresenceStatusService(repository, scopeService, auditService, eventBus);
  });

  it('creates a record and emits audit plus event', async () => {
    const record = createRecord();
    repository.findOverlappingRecord.mockResolvedValue(undefined);
    repository.createRecord.mockResolvedValue(record);

    await expect(
      service.createRecord(currentUser(), createInput(), {
        traceId: 'trace-create',
        ip: '203.0.113.10',
        userAgent: 'vitest-agent',
      }),
    ).resolves.toBe(record);

    expect(repository.createRecord).toHaveBeenCalledWith(createInput(), {
      enterpriseId: 'enterprise-001',
      userId: 'user-001',
      employeeNo: 'E001',
      userName: 'Alice',
      departmentId: 'department-001',
      departmentName: 'Operations',
    });
    expect(auditService.record).toHaveBeenCalledWith({
      actorUserId: 'user-001',
      actorAccount: 'alice',
      action: 'presence.status.create',
      resourceType: 'presence.status_record',
      resourceId: 'record-001',
      traceId: 'trace-create',
      ip: '203.0.113.10',
      userAgent: 'vitest-agent',
      result: 'success',
      metadata: {
        targetUserId: 'user-001',
        status: 'business_trip',
        startAt: '2026-05-25T01:00:00.000Z',
        endAt: '2026-05-25T09:00:00.000Z',
      },
    });
    expect(eventBus.publish).toHaveBeenCalledWith({
      type: presenceEvents.statusChanged,
      source: 'presence.api',
      traceId: 'trace-create',
      payload: {
        recordId: 'record-001',
        enterpriseId: 'enterprise-001',
        userId: 'user-001',
        status: 'business_trip',
        startAt: '2026-05-25T01:00:00.000Z',
        endAt: '2026-05-25T09:00:00.000Z',
        changedBy: 'user-001',
        changeKind: 'created',
      },
    });
  });

  it('rejects overlapping create without audit or event', async () => {
    repository.findOverlappingRecord.mockResolvedValue(createRecord());

    await expect(service.createRecord(currentUser(), createInput(), {})).rejects.toBeInstanceOf(ConflictException);
    expect(repository.createRecord).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('rejects create when current user has no department', async () => {
    await expect(
      service.createRecord(
        {
          ...currentUser(),
          departmentId: undefined,
        },
        createInput(),
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cancels own record and emits audit plus event', async () => {
    const record = createRecord();
    const cancelled = { ...record, cancelledAt: '2026-05-25T02:00:00.000Z' };
    repository.listUserRecords.mockResolvedValue([record]);
    repository.cancelRecord.mockResolvedValue(cancelled);

    await expect(service.cancelRecord(currentUser(), record.id, { traceId: 'trace-cancel' })).resolves.toBe(cancelled);

    expect(auditService.record).toHaveBeenCalledWith({
      actorUserId: 'user-001',
      actorAccount: 'alice',
      action: 'presence.status.cancel',
      resourceType: 'presence.status_record',
      resourceId: 'record-001',
      traceId: 'trace-cancel',
      ip: undefined,
      userAgent: undefined,
      result: 'success',
      metadata: {
        targetUserId: 'user-001',
        status: 'business_trip',
        startAt: '2026-05-25T01:00:00.000Z',
        endAt: '2026-05-25T09:00:00.000Z',
      },
    });
    expect(eventBus.publish).toHaveBeenCalledWith({
      type: 'presence.status.changed',
      source: 'presence.api',
      traceId: 'trace-cancel',
      payload: {
        recordId: 'record-001',
        enterpriseId: 'enterprise-001',
        userId: 'user-001',
        status: 'business_trip',
        startAt: '2026-05-25T01:00:00.000Z',
        endAt: '2026-05-25T09:00:00.000Z',
        changedBy: 'user-001',
        changeKind: 'cancelled',
      },
    });
  });

  it('rejects cancel for another user without manage permission', async () => {
    repository.listUserRecords.mockResolvedValue([]);

    await expect(service.cancelRecord(currentUser(), 'other-record', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows manager to cancel another user record', async () => {
    const cancelled = { ...createRecord({ userId: 'user-002' }), cancelledAt: '2026-05-25T02:00:00.000Z' };
    repository.listUserRecords.mockResolvedValue([]);
    repository.cancelRecord.mockResolvedValue(cancelled);

    await expect(
      service.cancelRecord(
        {
          ...currentUser(),
          permissions: [{ code: presencePermissions.statusManage, name: 'manage', moduleName: 'presence' }],
        },
        cancelled.id,
        {},
      ),
    ).resolves.toBe(cancelled);
  });

  it('returns not found when cancel target is missing or already cancelled', async () => {
    const record = createRecord();
    repository.listUserRecords.mockResolvedValue([record]);
    repository.cancelRecord.mockResolvedValue(undefined);

    await expect(service.cancelRecord(currentUser(), record.id, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps self scope to userIds query', async () => {
    repository.listActiveRecords.mockResolvedValue([createRecord()]);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'self',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentIds: [],
      degradedFromCustom: false,
    });

    await service.getBoard(currentUser());

    expect(scopeService.resolveScope).toHaveBeenCalledWith(currentUser(), 'presence');
    expect(repository.listActiveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        enterpriseId: 'enterprise-001',
        userIds: ['user-001'],
      }),
    );
    expect(repository.listActiveRecords.mock.calls[0][0]).not.toHaveProperty('departmentIds');
  });

  it('maps company scope without userIds or departmentIds', async () => {
    repository.listActiveRecords.mockResolvedValue([]);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'company',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentIds: [],
      degradedFromCustom: false,
    });

    await service.getBoard(currentUser());

    expect(repository.listActiveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        enterpriseId: 'enterprise-001',
      }),
    );
    expect(repository.listActiveRecords.mock.calls[0][0]).not.toHaveProperty('userIds');
    expect(repository.listActiveRecords.mock.calls[0][0]).not.toHaveProperty('departmentIds');
  });

  it('maps department scope to departmentIds query', async () => {
    repository.listActiveRecords.mockResolvedValue([]);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'department',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentId: 'department-001',
      departmentIds: ['department-001'],
      degradedFromCustom: false,
    });

    await service.getBoard(currentUser());

    expect(repository.listActiveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentIds: ['department-001'],
      }),
    );
  });

  it('maps department_tree scope to resolved departmentIds query', async () => {
    repository.listActiveRecords.mockResolvedValue([]);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'department_tree',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentId: 'department-001',
      departmentIds: ['department-001', 'department-002'],
      degradedFromCustom: false,
    });

    await service.getBoard(currentUser());

    expect(repository.listActiveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentIds: ['department-001', 'department-002'],
      }),
    );
  });

  it('maps degraded custom scope after resolver turns it into self', async () => {
    repository.listActiveRecords.mockResolvedValue([]);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'self',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentIds: [],
      degradedFromCustom: true,
    });

    await service.getBoard(currentUser());

    expect(repository.listActiveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['user-001'],
      }),
    );
  });

  it('returns current employee status for company scope', async () => {
    const record = createRecord({ userId: 'user-002' });
    repository.listActiveRecords.mockResolvedValue([record]);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'company',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentIds: [],
      degradedFromCustom: false,
    });

    await expect(service.getEmployeeStatus(currentUser(), 'user-002')).resolves.toEqual({ record });

    expect(repository.listActiveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        enterpriseId: 'enterprise-001',
        userIds: ['user-002'],
      }),
    );
    expect(repository.listActiveRecords.mock.calls[0][0]).not.toHaveProperty('departmentIds');
  });

  it('returns null for other employees under self scope without querying repository', async () => {
    scopeService.resolveScope.mockResolvedValue({
      kind: 'self',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentIds: [],
      degradedFromCustom: false,
    });

    await expect(service.getEmployeeStatus(currentUser(), 'user-002')).resolves.toEqual({ record: null });

    expect(repository.listActiveRecords).not.toHaveBeenCalled();
  });

  it('filters employee status by snapshot department for department scope', async () => {
    repository.listActiveRecords.mockResolvedValue([]);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'department_tree',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentId: 'department-001',
      departmentIds: ['department-001', 'department-002'],
      degradedFromCustom: false,
    });

    await expect(service.getEmployeeStatus(currentUser(), 'user-002')).resolves.toEqual({ record: null });

    expect(repository.listActiveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['user-002'],
        departmentIds: ['department-001', 'department-002'],
      }),
    );
  });
});

type MockPresenceRepository = {
  [K in keyof PresenceRepository]: ReturnType<typeof vi.fn>;
};

interface MockPlatformScopePort extends PlatformScopePort {
  resolveScope: ReturnType<typeof vi.fn>;
}

interface MockPlatformAuditPort extends PlatformAuditPort {
  record: ReturnType<typeof vi.fn>;
}

interface MockEventBus extends EventBus {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}

function createRepositoryMock(): MockPresenceRepository {
  return {
    listActiveRecords: vi.fn(),
    listUserRecords: vi.fn(),
    createRecord: vi.fn(),
    cancelRecord: vi.fn(),
    findOverlappingRecord: vi.fn(),
  };
}

function currentUser(): CurrentUserDto {
  return {
    id: 'user-001',
    account: 'alice',
    employeeNo: 'E001',
    name: 'Alice',
    enterpriseId: 'enterprise-001',
    departmentId: 'department-001',
    departmentName: 'Operations',
    roles: ['employee'],
    permissions: [{ code: presencePermissions.statusCreate, name: 'create', moduleName: 'presence' }],
    dataScopes: {
      profile: ['self'],
      presence: ['self'],
      report: ['self'],
    },
    mustChangePassword: false,
  };
}

function createInput() {
  return {
    status: 'business_trip' as const,
    startAt: '2026-05-25T01:00:00.000Z',
    endAt: '2026-05-25T09:00:00.000Z',
    remark: 'client visit',
  };
}

function createRecord(overrides: Partial<PresenceStatusRecordDto> = {}): PresenceStatusRecordDto {
  return {
    id: 'record-001',
    enterpriseId: 'enterprise-001',
    userId: 'user-001',
    employeeNo: 'E001',
    userName: 'Alice',
    departmentId: 'department-001',
    departmentName: 'Operations',
    status: 'business_trip',
    startAt: '2026-05-25T01:00:00.000Z',
    endAt: '2026-05-25T09:00:00.000Z',
    remark: 'client visit',
    createdBy: 'user-001',
    createdAt: '2026-05-25T00:00:00.000Z',
    ...overrides,
  };
}
