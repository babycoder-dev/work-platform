import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EventBus } from '@work/event-bus';
import type {
  CurrentUserDto,
  PlatformAuditPort,
  PlatformEmployeeLookupPort,
  PlatformScopePort,
} from '@work/platform-contract';
import type { PresenceStatusRecordDto } from '@work/presence-contract';
import { presenceEvents, presencePermissions } from '@work/presence-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresenceRepository } from '../db/presence.repository';
import { PresenceStatusService } from './presence-status.service';

describe('PresenceStatusService', () => {
  let repository: MockPresenceRepository;
  let scopeService: MockPlatformScopePort;
  let employeeLookup: MockPlatformEmployeeLookupPort;
  let auditService: MockPlatformAuditPort;
  let eventBus: MockEventBus;
  let service: PresenceStatusService;

  beforeEach(() => {
    repository = createRepositoryMock();
    scopeService = {
      resolveScope: vi.fn(),
      matchesScope: vi.fn(),
    };
    employeeLookup = {
      listEmployeesByIds: vi.fn(async (_enterpriseId, ids) =>
        ids.map((id: string) => ({
          id,
          employeeNo: 'E002',
          name: 'Bob',
          departmentId: 'department-002',
          departmentName: 'Product',
        })),
      ),
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
    service = new PresenceStatusService(
      repository,
      scopeService,
      employeeLookup,
      auditService,
      eventBus,
    );
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
        statusLabel: '出差',
        startAt: '2026-05-25T01:00:00.000Z',
        endAt: '2026-05-25T09:00:00.000Z',
        changedBy: 'user-001',
        changeKind: 'created',
      },
    });
  });

  it('rejects unknown, archived, and default status keys before overlap lookup', async () => {
    repository.findStatusTypeByKey.mockResolvedValueOnce(undefined);
    await expect(service.createRecord(currentUser(), createInput(), {})).rejects.toBeInstanceOf(
      BadRequestException,
    );

    repository.findStatusTypeByKey.mockResolvedValueOnce({
      ...(await createRepositoryMock().findStatusTypeByKey('', 'leave')),
      status: 'archived',
      isDefault: false,
    });
    await expect(service.createRecord(currentUser(), createInput(), {})).rejects.toBeInstanceOf(
      BadRequestException,
    );

    repository.findStatusTypeByKey.mockResolvedValueOnce({
      ...(await createRepositoryMock().findStatusTypeByKey('', 'working')),
      key: 'working',
      label: '在岗',
      status: 'active',
      isDefault: true,
    });
    await expect(
      service.createRecord(currentUser(), { ...createInput(), status: 'working' }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.findOverlappingRecord).not.toHaveBeenCalled();
  });

  it('passes the current dictionary default key to overlap detection', async () => {
    repository.listStatusTypes.mockResolvedValue([
      {
        ...(await createRepositoryMock().findStatusTypeByKey('', 'vip_visit')),
        key: 'vip_visit',
        label: '贵宾接待',
        isDefault: true,
      },
    ]);
    repository.createRecord.mockResolvedValue(createRecord());

    await service.createRecord(currentUser(), createInput(), {});

    expect(repository.findOverlappingRecord).toHaveBeenCalledWith(
      expect.objectContaining({ exemptStatusKey: 'vip_visit' }),
    );
  });

  it('rejects overlapping create without audit or event', async () => {
    repository.findOverlappingRecord.mockResolvedValue(createRecord());

    await expect(service.createRecord(currentUser(), createInput(), {})).rejects.toBeInstanceOf(
      ConflictException,
    );
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

    await expect(
      service.cancelRecord(currentUser(), record.id, { traceId: 'trace-cancel' }),
    ).resolves.toBe(cancelled);

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
        statusLabel: '出差',
        startAt: '2026-05-25T01:00:00.000Z',
        endAt: '2026-05-25T09:00:00.000Z',
        changedBy: 'user-001',
        changeKind: 'cancelled',
      },
    });
  });

  it('rejects cancel for another user without manage permission', async () => {
    repository.listUserRecords.mockResolvedValue([]);

    await expect(service.cancelRecord(currentUser(), 'other-record', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows manager to cancel another user record', async () => {
    const cancelled = {
      ...createRecord({ userId: 'user-002' }),
      cancelledAt: '2026-05-25T02:00:00.000Z',
    };
    repository.listUserRecords.mockResolvedValue([]);
    repository.cancelRecord.mockResolvedValue(cancelled);

    await expect(
      service.cancelRecord(
        {
          ...currentUser(),
          permissions: [
            { code: presencePermissions.statusManage, name: 'manage', moduleName: 'presence' },
          ],
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

    await expect(service.cancelRecord(currentUser(), record.id, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
    scopeService.matchesScope.mockReturnValue(true);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'company',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentIds: [],
      degradedFromCustom: false,
    });

    await expect(service.getEmployeeStatus(currentUser(), 'user-002')).resolves.toEqual({ record });

    expect(employeeLookup.listEmployeesByIds).toHaveBeenCalledWith('enterprise-001', ['user-002']);
    expect(scopeService.matchesScope).toHaveBeenCalledWith(
      { id: 'user-002', enterpriseId: 'enterprise-001', departmentId: 'department-002' },
      expect.objectContaining({ kind: 'company' }),
    );
    expect(repository.listActiveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        enterpriseId: 'enterprise-001',
        userIds: ['user-002'],
      }),
    );
    expect(repository.listActiveRecords.mock.calls[0][0]).not.toHaveProperty('departmentIds');
  });

  it('returns null for other employees under self scope without querying repository', async () => {
    scopeService.matchesScope.mockReturnValue(false);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'self',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentIds: [],
      degradedFromCustom: false,
    });

    await expect(service.getEmployeeStatus(currentUser(), 'user-002')).resolves.toEqual({
      record: null,
    });

    expect(employeeLookup.listEmployeesByIds).toHaveBeenCalledWith('enterprise-001', ['user-002']);
    expect(scopeService.matchesScope).toHaveBeenCalled();
    expect(repository.listActiveRecords).not.toHaveBeenCalled();
  });

  it('returns null when the realtime subject department is outside department scope', async () => {
    scopeService.matchesScope.mockReturnValue(false);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'department_tree',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentId: 'department-001',
      departmentIds: ['department-001', 'department-002'],
      degradedFromCustom: false,
    });

    await expect(service.getEmployeeStatus(currentUser(), 'user-002')).resolves.toEqual({
      record: null,
    });

    expect(scopeService.matchesScope).toHaveBeenCalledWith(
      { id: 'user-002', enterpriseId: 'enterprise-001', departmentId: 'department-002' },
      expect.objectContaining({ departmentIds: ['department-001', 'department-002'] }),
    );
    expect(repository.listActiveRecords).not.toHaveBeenCalled();
  });

  it('returns current employee status after realtime department scope allows access', async () => {
    const record = createRecord({ userId: 'user-002', departmentId: 'old-department' });
    repository.listActiveRecords.mockResolvedValue([record]);
    scopeService.matchesScope.mockReturnValue(true);
    employeeLookup.listEmployeesByIds.mockResolvedValue([
      {
        id: 'user-002',
        employeeNo: 'E002',
        name: 'Bob',
        departmentId: 'department-001',
        departmentName: 'Operations',
      },
    ]);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'department',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentId: 'department-001',
      departmentIds: ['department-001'],
      degradedFromCustom: false,
    });

    await expect(service.getEmployeeStatus(currentUser(), 'user-002')).resolves.toEqual({ record });

    expect(repository.listActiveRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['user-002'],
      }),
    );
    expect(repository.listActiveRecords.mock.calls[0][0]).not.toHaveProperty('departmentIds');
  });

  it('returns null when the target employee does not exist', async () => {
    employeeLookup.listEmployeesByIds.mockResolvedValue([]);
    scopeService.resolveScope.mockResolvedValue({
      kind: 'company',
      userId: 'user-001',
      enterpriseId: 'enterprise-001',
      departmentIds: [],
      degradedFromCustom: false,
    });

    await expect(service.getEmployeeStatus(currentUser(), 'missing-user')).resolves.toEqual({
      record: null,
    });

    expect(scopeService.matchesScope).not.toHaveBeenCalled();
    expect(repository.listActiveRecords).not.toHaveBeenCalled();
  });
});

type MockPresenceRepository = {
  [K in keyof PresenceRepository]: ReturnType<typeof vi.fn>;
};

interface MockPlatformScopePort extends PlatformScopePort {
  resolveScope: ReturnType<typeof vi.fn>;
  matchesScope: ReturnType<typeof vi.fn>;
}

interface MockPlatformEmployeeLookupPort extends PlatformEmployeeLookupPort {
  listEmployeesByIds: ReturnType<typeof vi.fn>;
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
    ensurePresetStatusTypes: vi.fn(),
    listStatusTypes: vi.fn(async () => [
      {
        id: 'status-working',
        enterpriseId: 'enterprise-001',
        key: 'working',
        label: '在岗',
        isPreset: true,
        isDefault: true,
        status: 'active',
        sortOrder: 10,
        createdAt: '2026-05-25T00:00:00.000Z',
        updatedAt: '2026-05-25T00:00:00.000Z',
      },
    ]),
    findStatusTypeById: vi.fn(),
    findStatusTypeByKey: vi.fn(async (_enterpriseId, key) => ({
      id: `status-${key}`,
      enterpriseId: 'enterprise-001',
      key,
      label: key === 'business_trip' ? '出差' : key,
      isPreset: true,
      isDefault: key === 'working',
      status: 'active',
      sortOrder: 10,
      createdAt: '2026-05-25T00:00:00.000Z',
      updatedAt: '2026-05-25T00:00:00.000Z',
    })),
    createStatusType: vi.fn(),
    updateStatusType: vi.fn(),
    setDefaultStatusType: vi.fn(),
    setStatusTypeStatus: vi.fn(),
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
    permissions: [
      { code: presencePermissions.statusCreate, name: 'create', moduleName: 'presence' },
    ],
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
