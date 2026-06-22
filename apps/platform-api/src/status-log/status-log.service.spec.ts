import { NotFoundException } from '@nestjs/common';
import type {
  CurrentUserDto,
  EmployeeDto,
  PlatformScope,
  StatusLogDto,
} from '@work/platform-contract';
import { describe, expect, it, vi } from 'vitest';
import type { PlatformAuditContext } from '../auth/request-user';
import type { NewStatusLog, PlatformRepository } from '../repositories/platform.repository';
import type { PlatformScopeService } from '../scope/platform-scope.service';
import { StatusLogService } from './status-log.service';

const auditContext: PlatformAuditContext = {
  actorUserId: 'user-admin',
  actorAccount: 'admin',
  traceId: 'trace-status-log',
  ip: '198.51.100.20',
  userAgent: 'status-log-service-spec',
};

const currentUser: CurrentUserDto = {
  id: 'user-admin',
  enterpriseId: 'ent-default',
  account: 'admin',
  employeeNo: '000001',
  name: '管理员',
  roles: ['系统管理员'],
  permissions: [],
  dataScopes: {
    profile: ['company'],
    presence: ['company'],
    report: ['company'],
  },
  mustChangePassword: false,
};

describe('StatusLogService', () => {
  it('creates one log per unique subject and records bounded success audit metadata', async () => {
    const targetA = employee({ id: 'employee-a', departmentId: 'dept-a' });
    const targetB = employee({ id: 'employee-b', departmentId: 'dept-b' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockImplementation(async (id: string) => {
        return id === targetA.id ? targetA : targetB;
      }),
      createStatusLogs: vi.fn().mockImplementation(async (inputs: NewStatusLog[]) => {
        return inputs.map(toStatusLogDto);
      }),
    });
    const service = makeService(repository, makeScopeService(makeCompanyScope()));

    const result = await service.createStatusLogs(
      {
        subjectEmployeeIds: [targetA.id, targetB.id, targetA.id],
        content: '完成试用期沟通',
      },
      currentUser,
      auditContext,
    );

    expect(repository.createStatusLogs).toHaveBeenCalledTimes(1);
    const inserted = repository.createStatusLogs.mock.calls[0]?.[0] as NewStatusLog[];
    expect(inserted).toHaveLength(2);
    expect(inserted.map((item) => item.subjectEmployeeId)).toEqual([targetA.id, targetB.id]);
    expect(inserted).toEqual(
      inserted.map(() =>
        expect.objectContaining({
          enterpriseId: currentUser.enterpriseId,
          authorEmployeeId: currentUser.id,
          content: '完成试用期沟通',
        }),
      ),
    );
    expect(result).toHaveLength(2);
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.status-log.create',
        resourceType: 'platform.status-log',
        resourceId: undefined,
        result: 'success',
        metadata: {
          subjectEmployeeIds: [targetA.id, targetB.id],
          subjectCount: 2,
          contentLength: '完成试用期沟通'.length,
        },
      }),
    );
    expect(repository.recordAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ content: '完成试用期沟通' }),
      }),
    );
  });

  it('rejects the whole batch when any subject is outside profile write scope', async () => {
    const inside = employee({ id: 'employee-inside', departmentId: 'dept-a' });
    const outside = employee({ id: 'employee-outside', departmentId: 'dept-b' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockImplementation(async (id: string) => {
        return id === inside.id ? inside : outside;
      }),
    });
    const service = makeService(
      repository,
      makeScopeService({
        kind: 'department',
        enterpriseId: currentUser.enterpriseId,
        userId: currentUser.id,
        departmentIds: ['dept-a'],
        degradedFromCustom: false,
      }),
    );

    await expect(
      service.createStatusLogs(
        {
          subjectEmployeeIds: [inside.id, outside.id],
          content: '批量近况',
        },
        currentUser,
        auditContext,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.createStatusLogs).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform.status-log.create',
        resourceType: 'platform.status-log',
        resourceId: undefined,
        result: 'failure',
        metadata: {
          subjectCount: 2,
          reason: 'request_rejected',
        },
      }),
    );
  });

  it('rejects cross-enterprise subjects without leaking the failing subject id', async () => {
    const target = employee({ id: 'employee-foreign', enterpriseId: 'ent-other' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockResolvedValue(target),
    });
    const service = makeService(repository, makeScopeService(makeCompanyScope()));

    await expect(
      service.createStatusLogs(
        {
          subjectEmployeeIds: [target.id],
          content: '跨企业近况',
        },
        currentUser,
        auditContext,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.createStatusLogs).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failure',
        metadata: {
          subjectCount: 1,
          reason: 'request_rejected',
        },
      }),
    );
    expect(repository.recordAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ subjectEmployeeIds: [target.id] }),
      }),
    );
  });

  it('lets self-scoped users create logs only for themselves', async () => {
    const self = employee({ id: currentUser.id });
    const other = employee({ id: 'employee-other' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockImplementation(async (id: string) => {
        return id === currentUser.id ? self : other;
      }),
      createStatusLogs: vi.fn().mockImplementation(async (inputs: NewStatusLog[]) => {
        return inputs.map(toStatusLogDto);
      }),
    });
    const service = makeService(
      repository,
      makeScopeService({
        kind: 'self',
        enterpriseId: currentUser.enterpriseId,
        userId: currentUser.id,
        departmentIds: [],
        degradedFromCustom: false,
      }),
    );

    await expect(
      service.createStatusLogs(
        { subjectEmployeeIds: [currentUser.id], content: '本人近况' },
        currentUser,
        auditContext,
      ),
    ).resolves.toHaveLength(1);

    await expect(
      service.createStatusLogs(
        { subjectEmployeeIds: [other.id], content: '他人近况' },
        currentUser,
        auditContext,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists logs only when the subject is inside profile read scope and preserves paging totals', async () => {
    const target = employee({ id: 'employee-target', departmentId: 'dept-a' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockResolvedValue(target),
      listStatusLogsBySubject: vi.fn().mockResolvedValue({
        items: [statusLog({ id: 'log-2' })],
        total: 3,
      }),
    });
    const service = makeService(
      repository,
      makeScopeService({
        kind: 'department',
        enterpriseId: currentUser.enterpriseId,
        userId: currentUser.id,
        departmentIds: ['dept-a'],
        degradedFromCustom: false,
      }),
    );

    await expect(
      service.listStatusLogs(target.id, { limit: 1, offset: 1 }, currentUser),
    ).resolves.toEqual({
      items: [statusLog({ id: 'log-2' })],
      total: 3,
    });
    expect(repository.listStatusLogsBySubject).toHaveBeenCalledWith(
      currentUser.enterpriseId,
      target.id,
      { limit: 1, offset: 1 },
    );
  });

  it('hides out-of-scope read targets and does not write failure audit for reads', async () => {
    const target = employee({ id: 'employee-target', departmentId: 'dept-b' });
    const repository = makeRepository({
      findEmployeeById: vi.fn().mockResolvedValue(target),
    });
    const service = makeService(
      repository,
      makeScopeService({
        kind: 'department',
        enterpriseId: currentUser.enterpriseId,
        userId: currentUser.id,
        departmentIds: ['dept-a'],
        degradedFromCustom: false,
      }),
    );

    await expect(service.listStatusLogs(target.id, {}, currentUser)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.listStatusLogsBySubject).not.toHaveBeenCalled();
    expect(repository.recordAuditLog).not.toHaveBeenCalled();
  });

  it('does not depend on an event bus', () => {
    expect(StatusLogService.toString()).not.toContain('EVENT_BUS');
  });
});

function makeService(
  repository: PlatformRepository,
  scopeService: PlatformScopeService,
): StatusLogService {
  return new StatusLogService(repository, scopeService);
}

function makeRepository(
  overrides: Partial<Record<keyof PlatformRepository, ReturnType<typeof vi.fn>>> = {},
) {
  return {
    findEmployeeById: vi.fn(),
    createStatusLogs: vi.fn(),
    listStatusLogsBySubject: vi.fn(),
    recordAuditLog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as PlatformRepository & {
    createStatusLogs: ReturnType<typeof vi.fn>;
    listStatusLogsBySubject: ReturnType<typeof vi.fn>;
    recordAuditLog: ReturnType<typeof vi.fn>;
  };
}

function makeScopeService(scope: PlatformScope): PlatformScopeService {
  return {
    resolveScope: vi.fn().mockResolvedValue(scope),
    matchesScope: vi
      .fn()
      .mockImplementation((employee: EmployeeDto, resolvedScope: PlatformScope) => {
        if (employee.enterpriseId !== resolvedScope.enterpriseId) {
          return false;
        }
        switch (resolvedScope.kind) {
          case 'company':
            return true;
          case 'self':
            return employee.id === resolvedScope.userId;
          case 'department':
          case 'department_tree':
            return (
              employee.departmentId !== undefined &&
              resolvedScope.departmentIds.includes(employee.departmentId)
            );
        }
      }),
  } as unknown as PlatformScopeService;
}

function makeCompanyScope(): PlatformScope {
  return {
    kind: 'company',
    enterpriseId: currentUser.enterpriseId,
    userId: currentUser.id,
    departmentIds: [],
    degradedFromCustom: false,
  };
}

function employee(overrides: Partial<EmployeeDto> = {}): EmployeeDto {
  return {
    id: 'employee-1',
    enterpriseId: 'ent-default',
    employeeNo: 'E001',
    account: 'employee',
    name: '员工',
    status: 'active',
    roleIds: [],
    mustChangePassword: false,
    ...overrides,
  };
}

function statusLog(overrides: Partial<StatusLogDto> = {}): StatusLogDto {
  return {
    id: 'log-1',
    enterpriseId: currentUser.enterpriseId,
    subjectEmployeeId: 'employee-1',
    authorEmployeeId: currentUser.id,
    content: '近况',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

function toStatusLogDto(input: NewStatusLog): StatusLogDto {
  return {
    id: input.id,
    enterpriseId: input.enterpriseId,
    subjectEmployeeId: input.subjectEmployeeId,
    authorEmployeeId: input.authorEmployeeId,
    content: input.content,
    createdAt: input.createdAt,
  };
}
