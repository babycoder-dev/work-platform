import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { EventBus } from '@work/event-bus';
import type { FileStoragePort } from '@work/files-contract';
import { FORM_FIELD_LIMITS, formsPermissions, type FormActorContext } from '@work/forms-contract';
import type {
  CurrentUserDto,
  PlatformAuditPort,
  PlatformEmployeeLookupPort,
  PlatformScopePort,
} from '@work/platform-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryFormsRepository } from '../db/in-memory-forms.repository';
import { FormsService } from './forms.service';

describe('FormsService', () => {
  let formsRepository: InMemoryFormsRepository;
  let fileStorage: FileStoragePort;
  let employeeLookup: PlatformEmployeeLookupPort;
  let scopeService: PlatformScopePort;
  let audit: PlatformAuditPort;
  let events: EventBus;
  let service: FormsService;

  beforeEach(() => {
    formsRepository = new InMemoryFormsRepository();
    fileStorage = {
      withUnitOfWork: vi.fn(async (operation) => operation({ kind: 'unit-of-work' })),
      attachFiles: vi.fn(async (_actor, input) =>
        input.fileIds.map((fileId: string) => ({
          id: fileId,
          enterpriseId: 'ent-default',
          provider: 'local',
          storageKey: `ent-default/2026/06/${fileId}`,
          originalName: `${fileId}.txt`,
          mediaType: 'text/plain',
          sizeBytes: 5,
          sha256: 'a'.repeat(64),
          status: 'attached',
          uploadedBy: 'user-1',
          createdAt: '2026-06-05T00:00:00.000Z',
          stagedExpiresAt: '2026-06-06T00:00:00.000Z',
        })),
      ),
      openFile: vi.fn(),
    };
    employeeLookup = {
      listEmployeesByIds: vi.fn(async (_enterpriseId, ids) =>
        ids
          .filter((id: string) => id === 'employee-1')
          .map((id: string) => ({
            id,
            employeeNo: 'E001',
            name: 'Alice',
            departmentId: 'dept-1',
            departmentName: '研发部',
          })),
      ),
    };
    scopeService = {
      resolveScope: vi.fn(async (user) => ({
        kind: 'company' as const,
        userId: user.id,
        enterpriseId: user.enterpriseId,
        departmentIds: [],
        degradedFromCustom: false,
      })),
      matchesScope: vi.fn(() => true),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    events = eventBus();
    service = new FormsService(formsRepository, fileStorage, employeeLookup, scopeService, audit, events);
  });

  it('updates definitions with optimistic revision checks', async () => {
    const created = await service.updateDefinition(
      actor(),
      'profile.employee',
      {
        revision: 0,
        fields: [
          {
            fieldKey: 'nickname',
            label: '昵称',
            fieldType: 'text',
            required: true,
            sortOrder: 1,
          },
        ],
      },
      { traceId: 'trace-definition', ip: '127.0.0.1', userAgent: 'vitest' },
    );

    expect(created.revision).toBe(1);
    expect(created.fields?.map((field) => field.fieldKey)).toEqual(['nickname']);
    await expect(
      service.updateDefinition(actor(), 'profile.employee', { revision: 0, fields: [] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAccount: 'forms-user',
        action: 'forms.definition.update',
        traceId: 'trace-definition',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        result: 'success',
        metadata: expect.objectContaining({ slotKey: 'profile.employee', revision: 1 }),
      }),
    );
  });

  it('creates records through Files port, snapshots employee displays, and keeps old snapshots immutable', async () => {
    await service.updateDefinition(actor(), 'profile.employee', {
      revision: 0,
      fields: [
        { fieldKey: 'nickname', label: '昵称', fieldType: 'text', required: true, sortOrder: 1 },
        { fieldKey: 'resume', label: '附件', fieldType: 'file', required: false, sortOrder: 2 },
        { fieldKey: 'owner', label: '负责人', fieldType: 'employee', required: true, sortOrder: 3 },
      ],
    });

    const record = await service.createRecord(actor(), {
      slotKey: 'profile.employee',
      subjectType: 'employee',
      subjectId: 'employee-1',
      definitionRevision: 1,
      values: [
        { fieldKey: 'nickname', value: 'Alice' },
        { fieldKey: 'resume', value: ['file-1'] },
        { fieldKey: 'owner', value: ['employee-1'] },
      ],
    });

    expect(fileStorage.attachFiles).toHaveBeenCalledWith(
      expect.objectContaining({ enterpriseId: 'ent-default', userId: 'user-1' }),
      {
        fileIds: ['file-1'],
        ownerModule: 'forms',
        referenceType: 'form_record',
        referenceId: record.id,
      },
      expect.objectContaining({ kind: 'unit-of-work' }),
    );
    expect(record.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: 'nickname', fieldLabelSnapshot: '昵称', value: 'Alice' }),
        expect.objectContaining({
          fieldKey: 'owner',
          displaySnapshot: [expect.objectContaining({ name: 'Alice', departmentName: '研发部' })],
        }),
      ]),
    );

    await service.updateDefinition(actor(), 'profile.employee', {
      revision: 1,
      fields: [
        { fieldKey: 'nickname', label: '新昵称', fieldType: 'text', required: true, sortOrder: 1 },
      ],
    });
    await expect(service.getRecord(actor(), record.id)).resolves.toEqual(
      expect.objectContaining({
        values: expect.arrayContaining([
          expect.objectContaining({ fieldKey: 'nickname', fieldLabelSnapshot: '昵称' }),
        ]),
      }),
    );
  });

  it('uses singleton cardinality for profile.employee records', async () => {
    await service.updateDefinition(actor(), 'profile.employee', {
      revision: 0,
      fields: [{ fieldKey: 'nickname', label: '昵称', fieldType: 'text', required: true, sortOrder: 1 }],
    });
    const first = await service.createRecord(actor(), {
      slotKey: 'profile.employee',
      subjectType: 'employee',
      subjectId: 'employee-1',
      definitionRevision: 1,
      values: [{ fieldKey: 'nickname', value: 'first' }],
    });
    const second = await service.createRecord(actor(), {
      slotKey: 'profile.employee',
      subjectType: 'employee',
      subjectId: 'employee-1',
      definitionRevision: 1,
      values: [{ fieldKey: 'nickname', value: 'second' }],
    });

    expect(second.id).toBe(first.id);
    expect(formsRepository.records).toHaveLength(1);
    expect(second.values).toEqual([
      expect.objectContaining({ fieldKey: 'nickname', value: 'second' }),
    ]);
  });

  it('reads and upserts profile.employee records by authorized subject with create/update semantics', async () => {
    await service.updateDefinition(actor(), 'profile.employee', {
      revision: 0,
      fields: [{ fieldKey: 'nickname', label: '昵称', fieldType: 'text', required: true, sortOrder: 1 }],
    });
    vi.mocked(events.publish).mockClear();
    vi.mocked(audit.record).mockClear();

    const created = await service.upsertRecordBySubject(
      actor(),
      currentUser(),
      {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
        definitionRevision: 1,
        values: [{ fieldKey: 'nickname', value: 'first' }],
      },
      { traceId: 'trace-upsert' },
    );
    const updated = await service.upsertRecordBySubject(actor(), currentUser(), {
      slotKey: 'profile.employee',
      subjectType: 'employee',
      subjectId: 'employee-1',
      definitionRevision: 1,
      values: [{ fieldKey: 'nickname', value: 'second' }],
    });

    expect(updated.id).toBe(created.id);
    expect(formsRepository.records).toHaveLength(1);
    await expect(
      service.getRecordBySubject(actor(), currentUser(), {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: created.id,
        values: [expect.objectContaining({ fieldKey: 'nickname', value: 'second' })],
      }),
    );
    expect(scopeService.resolveScope).toHaveBeenCalledWith(currentUser(), 'profile');
    expect(scopeService.matchesScope).toHaveBeenCalledWith(
      { id: 'employee-1', enterpriseId: 'ent-default', departmentId: 'dept-1' },
      expect.objectContaining({ kind: 'company' }),
    );
    expect(events.publish).toHaveBeenCalledTimes(1);
    expect(events.publish).toHaveBeenCalledWith({
      type: 'forms.record.created',
      source: 'forms.api',
      traceId: 'trace-upsert',
      payload: expect.objectContaining({
        enterpriseId: 'ent-default',
        slotKey: 'profile.employee',
        recordId: created.id,
        subjectType: 'employee',
        subjectId: 'employee-1',
        submittedBy: 'user-1',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'forms.record.create',
        resourceId: created.id,
        traceId: 'trace-upsert',
        metadata: expect.objectContaining({
          slotKey: 'profile.employee',
          subjectType: 'employee',
          subjectId: 'employee-1',
          fieldKeys: ['nickname'],
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'forms.record.update',
        resourceId: created.id,
        metadata: expect.objectContaining({
          slotKey: 'profile.employee',
          recordId: created.id,
          subjectType: 'employee',
          subjectId: 'employee-1',
          revision: 1,
          fieldKeys: ['nickname'],
        }),
      }),
    );
  });

  it('hides profile.employee subject records when scope denies access', async () => {
    await service.updateDefinition(actor(), 'profile.employee', {
      revision: 0,
      fields: [{ fieldKey: 'nickname', label: '昵称', fieldType: 'text', required: true, sortOrder: 1 }],
    });
    vi.mocked(audit.record).mockClear();
    vi.mocked(scopeService.matchesScope).mockReturnValue(false);

    await expect(
      service.upsertRecordBySubject(actor(), currentUser(), {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
        definitionRevision: 1,
        values: [{ fieldKey: 'nickname', value: 'first' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getRecordBySubject(actor(), currentUser(), {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(formsRepository.records).toHaveLength(0);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'forms.record.upsert',
        result: 'failure',
        metadata: {
          slotKey: 'profile.employee',
          subjectType: 'employee',
          subjectId: 'employee-1',
          reason: 'not_found_or_out_of_scope',
        },
      }),
    );
  });

  it('audits rejected subject upserts without leaking values', async () => {
    await service.updateDefinition(actor(), 'profile.employee', {
      revision: 0,
      fields: [{ fieldKey: 'nickname', label: '昵称', fieldType: 'text', required: true, sortOrder: 1 }],
    });
    vi.mocked(audit.record).mockClear();

    await expect(
      service.upsertRecordBySubject(
        actor([formsPermissions.recordView]),
        currentUser(),
        {
          slotKey: 'profile.employee',
          subjectType: 'employee',
          subjectId: 'employee-1',
          definitionRevision: 1,
          values: [{ fieldKey: 'nickname', value: 'secret' }],
        },
        { traceId: 'trace-permission-denied' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'forms.record.upsert',
        result: 'failure',
        traceId: 'trace-permission-denied',
        metadata: {
          slotKey: 'profile.employee',
          subjectType: 'employee',
          subjectId: 'employee-1',
          reason: 'permission_denied',
        },
      }),
    );
    expect(audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ values: expect.anything() }),
      }),
    );

    vi.mocked(audit.record).mockClear();
    await expect(
      service.upsertRecordBySubject(actor(), currentUser(), {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
        definitionRevision: 0,
        values: [{ fieldKey: 'nickname', value: 'secret' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'forms.record.upsert',
        result: 'failure',
        metadata: expect.objectContaining({
          reason: 'definition_revision_conflict',
          subjectId: 'employee-1',
        }),
      }),
    );

    vi.mocked(audit.record).mockClear();
    await expect(
      service.upsertRecordBySubject(actor(), currentUser(), {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
        definitionRevision: 1,
        values: [{ fieldKey: 'unknown', value: 'secret' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'forms.record.upsert',
        result: 'failure',
        metadata: expect.objectContaining({
          reason: 'record_validation_failed',
          subjectId: 'employee-1',
        }),
      }),
    );
  });

  it('bounds rejected upsert failure audit metadata from route parameters', async () => {
    const longSubjectId = 'employee-'.padEnd(180, 'x');

    await expect(
      service.upsertRecordBySubject(
        actor([formsPermissions.recordView]),
        currentUser(),
        {
          slotKey: 'profile.employee',
          subjectType: 'employee',
          subjectId: longSubjectId,
          definitionRevision: 1,
          values: [{ fieldKey: 'nickname', value: 'secret' }],
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'forms.record.upsert',
        result: 'failure',
        metadata: expect.objectContaining({
          subjectId: longSubjectId.slice(0, 128),
          reason: 'permission_denied',
        }),
      }),
    );
    expect(audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ subjectId: longSubjectId }),
      }),
    );
  });

  it('preserves business errors when rejected upsert failure audit fails', async () => {
    await service.updateDefinition(actor(), 'profile.employee', {
      revision: 0,
      fields: [{ fieldKey: 'nickname', label: '昵称', fieldType: 'text', required: true, sortOrder: 1 }],
    });
    vi.mocked(scopeService.matchesScope).mockReturnValue(false);
    vi.mocked(audit.record).mockRejectedValueOnce(new Error('audit down'));

    await expect(
      service.upsertRecordBySubject(actor(), currentUser(), {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
        definitionRevision: 1,
        values: [{ fieldKey: 'nickname', value: 'first' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('attaches files to the actual singleton record id on replacement submissions', async () => {
    await service.updateDefinition(actor(), 'profile.employee', {
      revision: 0,
      fields: [
        { fieldKey: 'nickname', label: '昵称', fieldType: 'text', required: true, sortOrder: 1 },
        { fieldKey: 'resume', label: '附件', fieldType: 'file', required: false, sortOrder: 2 },
      ],
    });
    const first = await service.createRecord(actor(), {
      slotKey: 'profile.employee',
      subjectType: 'employee',
      subjectId: 'employee-1',
      definitionRevision: 1,
      values: [
        { fieldKey: 'nickname', value: 'first' },
        { fieldKey: 'resume', value: ['file-1'] },
      ],
    });
    const second = await service.createRecord(
      actor(),
      {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
        definitionRevision: 1,
        values: [
          { fieldKey: 'nickname', value: 'second' },
          { fieldKey: 'resume', value: ['file-2'] },
        ],
      },
      { traceId: 'trace-record', ip: '127.0.0.1', userAgent: 'vitest' },
    );

    expect(second.id).toBe(first.id);
    expect(fileStorage.attachFiles).toHaveBeenLastCalledWith(
      expect.objectContaining({ enterpriseId: 'ent-default', userId: 'user-1' }),
      {
        fileIds: ['file-2'],
        ownerModule: 'forms',
        referenceType: 'form_record',
        referenceId: first.id,
      },
      expect.objectContaining({ kind: 'unit-of-work' }),
    );
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actorAccount: 'forms-user',
        action: 'forms.record.create',
        traceId: 'trace-record',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        resourceId: first.id,
      }),
    );
  });

  it('rejects invalid record values and unknown employees', async () => {
    await service.updateDefinition(actor(), 'profile.employee', {
      revision: 0,
      fields: [
        { fieldKey: 'nickname', label: '昵称', fieldType: 'text', required: true, sortOrder: 1 },
        { fieldKey: 'owner', label: '负责人', fieldType: 'employee', required: false, sortOrder: 2 },
      ],
    });

    await expect(
      service.createRecord(actor(), {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
        definitionRevision: 1,
        values: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createRecord(actor(), {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
        definitionRevision: 1,
        values: [
          { fieldKey: 'nickname', value: 'Alice' },
          { fieldKey: 'owner', value: ['missing'] },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces definition and record input hard limits', async () => {
    await expect(
      service.updateDefinition(actor(), 'profile.employee', {
        revision: 0,
        fields: Array.from({ length: FORM_FIELD_LIMITS.maxFieldsPerDefinition + 1 }, (_, index) => ({
          fieldKey: `field_${index}`,
          label: `字段 ${index}`,
          fieldType: 'text',
          required: false,
          sortOrder: index,
        })),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.updateDefinition(actor(), 'profile.employee', {
        revision: 0,
        fields: [
          {
            fieldKey: 'choice',
            label: '选择',
            fieldType: 'single_select',
            required: false,
            sortOrder: 1,
            options: Array.from({ length: FORM_FIELD_LIMITS.maxOptionsPerField + 1 }, (_, index) => ({
              key: `option_${index}`,
              label: `选项 ${index}`,
            })),
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.updateDefinition(actor(), 'profile.employee', {
      revision: 0,
      fields: [
        { fieldKey: 'text', label: '短文本', fieldType: 'text', required: false, sortOrder: 1 },
        { fieldKey: 'textarea', label: '长文本', fieldType: 'textarea', required: false, sortOrder: 2 },
        { fieldKey: 'date', label: '日期', fieldType: 'date', required: false, sortOrder: 3 },
        {
          fieldKey: 'multi',
          label: '多选',
          fieldType: 'multi_select',
          required: false,
          sortOrder: 4,
          options: Array.from({ length: FORM_FIELD_LIMITS.maxOptionsPerField }, (_, index) => ({
            key: `option_${index}`,
            label: `选项 ${index}`,
          })),
        },
        { fieldKey: 'file', label: '文件', fieldType: 'file', required: false, sortOrder: 5 },
        { fieldKey: 'image', label: '图片', fieldType: 'image', required: false, sortOrder: 6 },
        { fieldKey: 'employee', label: '人员', fieldType: 'employee', required: false, sortOrder: 7 },
      ],
    });

    const oversizedCases = [
      { fieldKey: 'text', value: 'x'.repeat(FORM_FIELD_LIMITS.textMaxLength + 1) },
      { fieldKey: 'textarea', value: 'x'.repeat(FORM_FIELD_LIMITS.textareaMaxLength + 1) },
      {
        fieldKey: 'multi',
        value: Array.from({ length: FORM_FIELD_LIMITS.maxMultiSelectValues + 1 }, (_, index) => `option_${index}`),
      },
      {
        fieldKey: 'file',
        value: Array.from({ length: FORM_FIELD_LIMITS.maxFilesPerFileField + 1 }, (_, index) => `file_${index}`),
      },
      {
        fieldKey: 'image',
        value: Array.from({ length: FORM_FIELD_LIMITS.maxFilesPerFileField + 1 }, (_, index) => `image_${index}`),
      },
      {
        fieldKey: 'employee',
        value: Array.from(
          { length: FORM_FIELD_LIMITS.maxEmployeesPerEmployeeField + 1 },
          (_, index) => `employee_${index}`,
        ),
      },
    ];

    for (const item of oversizedCases) {
      await expect(
        service.createRecord(actor(), {
          slotKey: 'profile.employee',
          subjectType: 'employee',
          subjectId: 'employee-1',
          definitionRevision: 1,
          values: [item],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    await expect(
      service.createRecord(actor(), {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
        definitionRevision: 1,
        values: [{ fieldKey: 'date', value: '2026/06/06' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createRecord(actor(), {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
        definitionRevision: 1,
        values: [{ fieldKey: 'date', value: '2026-02-30' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createRecord(actor(), {
        slotKey: 'profile.employee',
        subjectType: 'employee',
        subjectId: 'employee-1',
        definitionRevision: 1,
        values: [{ fieldKey: 'text', value: 'x'.repeat(FORM_FIELD_LIMITS.maxRecordValuesJsonBytes) }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function actor(
  permissionCodes: string[] = [formsPermissions.recordSubmit, formsPermissions.recordView],
): FormActorContext {
  return {
    enterpriseId: 'ent-default',
    userId: 'user-1',
    account: 'forms-user',
    permissionCodes,
  };
}

function currentUser(): CurrentUserDto {
  return {
    id: 'user-1',
    account: 'forms-user',
    employeeNo: 'E001',
    name: 'Forms User',
    enterpriseId: 'ent-default',
    departmentId: 'dept-1',
    departmentName: '研发部',
    roles: ['admin'],
    permissions: [],
    dataScopes: {
      profile: ['company'],
      presence: ['self'],
      report: ['self'],
    },
    mustChangePassword: false,
  };
}

function eventBus(): EventBus {
  return {
    publish: vi.fn(async (event) => ({
      ...event,
      id: 'event-id',
      occurredAt: '2026-06-05T00:00:00.000Z',
    })),
    subscribe: vi.fn(() => () => undefined),
  };
}
