import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { EventBus } from '@work/event-bus';
import type { FileStoragePort } from '@work/files-contract';
import { FORM_FIELD_LIMITS, formsPermissions, type FormActorContext } from '@work/forms-contract';
import type { PlatformAuditPort, PlatformEmployeeLookupPort } from '@work/platform-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryFormsRepository } from '../db/in-memory-forms.repository';
import { FormsService } from './forms.service';

describe('FormsService', () => {
  let formsRepository: InMemoryFormsRepository;
  let fileStorage: FileStoragePort;
  let employeeLookup: PlatformEmployeeLookupPort;
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
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    events = eventBus();
    service = new FormsService(formsRepository, fileStorage, employeeLookup, audit, events);
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

function actor(): FormActorContext {
  return {
    enterpriseId: 'ent-default',
    userId: 'user-1',
    account: 'forms-user',
    permissionCodes: [formsPermissions.recordSubmit, formsPermissions.recordView],
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
