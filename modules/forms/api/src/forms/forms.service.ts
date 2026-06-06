import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@work/event-bus';
import { FILE_STORAGE_SERVICE, type FileActorContext, type FileStoragePort } from '@work/files-contract';
import {
  FORM_FIELD_LIMITS,
  formsEvents,
  formsPermissions,
  resolveActiveFormSlot,
  type CreateFormRecordInput,
  type FormActorContext,
  type FormAuditContext,
  type FormDefinitionDto,
  type FormFieldDto,
  type FormFieldOptionDto,
  type FormFieldType,
  type FormRecordDto,
  type FormsDefinitionUpdatedEvent,
  type FormsRecordCreatedEvent,
  type FormSlotDefinition,
  type FormSlotKey,
} from '@work/forms-contract';
import {
  PLATFORM_AUDIT_SERVICE,
  PLATFORM_EMPLOYEE_LOOKUP_SERVICE,
  type EmployeeLookupDto,
  type PlatformAuditPort,
  type PlatformEmployeeLookupPort,
} from '@work/platform-contract';
import { FORMS_REPOSITORY } from '../db/forms-repository.token';
import type { FormsRepository, ReplaceDefinitionFieldsInput, SaveRecordInput } from '../db/forms.repository';
import type { FormFieldInputDto, UpdateFormDefinitionDto } from './forms.dto';

@Injectable()
export class FormsService {
  constructor(
    @Inject(FORMS_REPOSITORY) private readonly repository: FormsRepository,
    @Inject(FILE_STORAGE_SERVICE) private readonly fileStorage: FileStoragePort,
    @Inject(PLATFORM_EMPLOYEE_LOOKUP_SERVICE)
    private readonly employeeLookup: PlatformEmployeeLookupPort,
    @Inject(PLATFORM_AUDIT_SERVICE) private readonly auditService: PlatformAuditPort,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  async getDefinition(actor: FormActorContext, slotKey: FormSlotKey): Promise<FormDefinitionDto> {
    const slot = assertActiveSlot(slotKey);
    const definition = await this.repository.findDefinitionWithFields(actor.enterpriseId, slot.slotKey);
    if (!definition) {
      const now = new Date().toISOString();
      return {
        id: '',
        enterpriseId: actor.enterpriseId,
        slotKey: slot.slotKey,
        ownerModule: slot.ownerModule,
        revision: 0,
        status: 'active',
        createdBy: actor.userId,
        createdAt: now,
        updatedAt: now,
        fields: [],
      };
    }
    return definition;
  }

  async updateDefinition(
    actor: FormActorContext,
    slotKey: FormSlotKey,
    input: UpdateFormDefinitionDto,
    auditContext: FormAuditContext = {},
  ): Promise<FormDefinitionDto> {
    const slot = assertActiveSlot(slotKey);
    const fields = validateDefinitionFields(input.fields);
    try {
      const updated = await this.fileStorage.withUnitOfWork((uow) =>
        this.repository.withUnitOfWork(uow, () =>
          this.repository.replaceDefinitionFields(
            {
              enterpriseId: actor.enterpriseId,
              slotKey: slot.slotKey,
              ownerModule: slot.ownerModule,
              expectedRevision: input.revision,
              updatedBy: actor.userId,
              fields,
            },
            uow,
          ),
        ),
      );
      await this.auditService.record({
        actorUserId: actor.userId,
        actorAccount: actor.account,
        action: 'forms.definition.update',
        resourceType: 'forms.form_definition',
        resourceId: updated.id,
        traceId: auditContext.traceId,
        ip: auditContext.ip,
        userAgent: auditContext.userAgent,
        result: 'success',
        metadata: {
          slotKey: slot.slotKey,
          revision: updated.revision,
          fieldKeys: updated.fields?.map((field) => field.fieldKey) ?? [],
        },
      });
      await this.eventBus.publish<FormsDefinitionUpdatedEvent>({
        type: formsEvents.definitionUpdated,
        source: 'forms.api',
        traceId: auditContext.traceId,
        payload: {
          enterpriseId: actor.enterpriseId,
          slotKey: slot.slotKey,
          revision: updated.revision,
          fieldKeys: updated.fields?.map((field) => field.fieldKey) ?? [],
          updatedBy: actor.userId,
          occurredAt: new Date().toISOString(),
        },
      });
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'FORMS_DEFINITION_REVISION_CONFLICT') {
        throw new ConflictException('表单定义版本已变化');
      }
      throw error;
    }
  }

  async createRecord(
    actor: FormActorContext,
    input: CreateFormRecordInput,
    auditContext: FormAuditContext = {},
  ): Promise<FormRecordDto> {
    requirePermission(actor, formsPermissions.recordSubmit);
    const slot = assertActiveSlot(input.slotKey);
    const definition = await this.repository.findDefinitionWithFields(actor.enterpriseId, slot.slotKey);
    if (!definition || definition.status !== 'active') {
      throw new NotFoundException('表单定义不存在');
    }
    if (input.definitionRevision !== definition.revision) {
      throw new ConflictException('表单定义版本已变化');
    }
    const fields = (definition.fields ?? []).filter((field) => field.status === 'active');
    const recordId = randomUUID();
    const normalized = await this.validateRecordValues(actor, fields, input.values);

    const record = await this.fileStorage.withUnitOfWork((uow) =>
      this.repository.withUnitOfWork(uow, async () => {
        const reserved = await this.repository.reserveRecord(
          {
            cardinality: slot.cardinality,
            record: {
              id: recordId,
              enterpriseId: actor.enterpriseId,
              definitionId: definition.id,
              slotKey: slot.slotKey,
              definitionRevision: definition.revision,
              subjectType: input.subjectType,
              subjectId: input.subjectId,
              submittedBy: actor.userId,
            },
          },
          uow,
        );
        for (const attachment of normalized.attachments) {
          await this.fileStorage.attachFiles(
            actorToFileActor(actor),
            {
              fileIds: attachment.fileIds,
              ownerModule: 'forms',
              referenceType: 'form_record',
              referenceId: reserved.id,
            },
            uow,
          );
        }
        return this.repository.replaceRecordValues(
          {
            enterpriseId: actor.enterpriseId,
            recordId: reserved.id,
            values: normalized.values,
          },
          uow,
        );
      }),
    );

    await this.auditService.record({
      actorUserId: actor.userId,
      actorAccount: actor.account,
      action: 'forms.record.create',
      resourceType: 'forms.form_record',
      resourceId: record.id,
      traceId: auditContext.traceId,
      ip: auditContext.ip,
      userAgent: auditContext.userAgent,
      result: 'success',
      metadata: {
        slotKey: slot.slotKey,
        recordId: record.id,
        subjectType: record.subjectType,
        subjectId: record.subjectId,
      },
    });
    await this.eventBus.publish<FormsRecordCreatedEvent>({
      type: formsEvents.recordCreated,
      source: 'forms.api',
      payload: {
        enterpriseId: actor.enterpriseId,
        slotKey: slot.slotKey,
        recordId: record.id,
        subjectType: record.subjectType,
        subjectId: record.subjectId,
        submittedBy: actor.userId,
        occurredAt: new Date().toISOString(),
      },
    });
    return record;
  }

  async getRecord(actor: FormActorContext, recordId: string): Promise<FormRecordDto> {
    requirePermission(actor, formsPermissions.recordView);
    const record = await this.repository.findRecordWithValues(actor.enterpriseId, recordId);
    if (!record) {
      throw new NotFoundException('表单记录不存在');
    }
    return record;
  }

  private async validateRecordValues(
    actor: FormActorContext,
    fields: FormFieldDto[],
    values: CreateFormRecordInput['values'],
  ): Promise<{
    values: SaveRecordInput['values'];
    attachments: Array<{ fieldKey: string; fileIds: string[] }>;
  }> {
    const serializedBytes = Buffer.byteLength(JSON.stringify(values), 'utf8');
    if (serializedBytes > FORM_FIELD_LIMITS.maxRecordValuesJsonBytes) {
      throw new BadRequestException('记录值超过大小限制');
    }
    const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
    const seen = new Set<string>();
    const valueByKey = new Map<string, unknown>();
    for (const item of values) {
      if (seen.has(item.fieldKey)) {
        throw new BadRequestException('字段值重复');
      }
      seen.add(item.fieldKey);
      if (!fieldByKey.has(item.fieldKey)) {
        throw new BadRequestException('未知字段');
      }
      valueByKey.set(item.fieldKey, item.value);
    }
    for (const field of fields) {
      if (field.required && !valueByKey.has(field.fieldKey)) {
        throw new BadRequestException('缺少必填字段');
      }
    }

    const normalizedValues = [];
    const attachments: Array<{ fieldKey: string; fileIds: string[] }> = [];
    for (const field of fields) {
      if (!valueByKey.has(field.fieldKey)) {
        continue;
      }
      const value = valueByKey.get(field.fieldKey);
      const normalized = await normalizeFieldValue(actor, field, value, this.employeeLookup);
      if ((field.fieldType === 'file' || field.fieldType === 'image') && normalized.fileIds.length > 0) {
        attachments.push({ fieldKey: field.fieldKey, fileIds: normalized.fileIds });
      }
      normalizedValues.push({
        fieldKey: field.fieldKey,
        fieldLabelSnapshot: field.label,
        fieldTypeSnapshot: field.fieldType,
        value: normalized.value,
        displaySnapshot: normalized.displaySnapshot,
        sortOrderSnapshot: field.sortOrder,
      });
    }
    return { values: normalizedValues, attachments };
  }
}

function assertActiveSlot(slotKey: string): FormSlotDefinition {
  const slot = resolveActiveFormSlot(slotKey);
  if (!slot) {
    throw new NotFoundException('表单槽位不存在');
  }
  return slot;
}

function validateDefinitionFields(
  fields: FormFieldInputDto[],
): Omit<ReplaceDefinitionFieldsInput['fields'][number], 'enterpriseId' | 'definitionId'>[] {
  if (fields.length > FORM_FIELD_LIMITS.maxFieldsPerDefinition) {
    throw new BadRequestException('字段数量超过限制');
  }
  const seen = new Set<string>();
  return fields.map((field) => {
    if (seen.has(field.fieldKey)) {
      throw new BadRequestException('字段 key 重复');
    }
    seen.add(field.fieldKey);
    if (field.options !== undefined && !isSelectField(field.fieldType)) {
      throw new BadRequestException('非选择字段不能包含 options');
    }
    if (isSelectField(field.fieldType)) {
      validateOptions(field.options);
    }
    return {
      fieldKey: field.fieldKey,
      label: field.label,
      fieldType: field.fieldType,
      required: field.required,
      description: field.description,
      sortOrder: field.sortOrder,
      options: field.options,
      status: 'active',
    };
  });
}

function validateOptions(options: FormFieldOptionDto[] | undefined): void {
  if (!options || options.length === 0) {
    throw new BadRequestException('选择字段必须包含 options');
  }
  if (options.length > FORM_FIELD_LIMITS.maxOptionsPerField) {
    throw new BadRequestException('选项数量超过限制');
  }
  const seen = new Set<string>();
  for (const option of options) {
    if (seen.has(option.key)) {
      throw new BadRequestException('选项 key 重复');
    }
    seen.add(option.key);
  }
}

async function normalizeFieldValue(
  actor: FormActorContext,
  field: FormFieldDto,
  value: unknown,
  employeeLookup: PlatformEmployeeLookupPort,
): Promise<{ value: unknown; displaySnapshot?: unknown; fileIds: string[] }> {
  switch (field.fieldType) {
    case 'text':
      return { value: expectString(value, FORM_FIELD_LIMITS.textMaxLength), fileIds: [] };
    case 'textarea':
      return { value: expectString(value, FORM_FIELD_LIMITS.textareaMaxLength), fileIds: [] };
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException('number 字段必须是有限数字');
      }
      return { value, fileIds: [] };
    case 'date':
      return { value: expectIsoDate(value), fileIds: [] };
    case 'single_select':
      return normalizeSingleSelect(field, value);
    case 'multi_select':
      return normalizeMultiSelect(field, value);
    case 'file':
    case 'image':
      return normalizeFileList(value);
    case 'employee':
      return normalizeEmployees(actor, value, employeeLookup);
  }
}

function normalizeSingleSelect(field: FormFieldDto, value: unknown) {
  const selected = expectString(value, FORM_FIELD_LIMITS.optionKeyMaxLength);
  const option = (field.options ?? []).find((candidate) => candidate.key === selected);
  if (!option) {
    throw new BadRequestException('选项不存在');
  }
  return { value: selected, displaySnapshot: option, fileIds: [] };
}

function normalizeMultiSelect(field: FormFieldDto, value: unknown) {
  const selected = expectStringArray(value, FORM_FIELD_LIMITS.maxMultiSelectValues);
  const options = new Map((field.options ?? []).map((option) => [option.key, option]));
  const display = selected.map((key) => {
    const option = options.get(key);
    if (!option) {
      throw new BadRequestException('选项不存在');
    }
    return option;
  });
  return { value: selected, displaySnapshot: display, fileIds: [] };
}

function normalizeFileList(value: unknown) {
  const fileIds = expectStringArray(value, FORM_FIELD_LIMITS.maxFilesPerFileField);
  return { value: fileIds, fileIds };
}

async function normalizeEmployees(
  actor: FormActorContext,
  value: unknown,
  employeeLookup: PlatformEmployeeLookupPort,
) {
  const employeeIds = expectStringArray(value, FORM_FIELD_LIMITS.maxEmployeesPerEmployeeField);
  const employees = await employeeLookup.listEmployeesByIds(actor.enterpriseId, employeeIds);
  const found = new Set(employees.map((employee) => employee.id));
  if (employeeIds.some((id) => !found.has(id))) {
    throw new NotFoundException('员工不存在');
  }
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  return {
    value: employeeIds,
    displaySnapshot: employeeIds.map((id) => byId.get(id)).filter((item): item is EmployeeLookupDto => Boolean(item)),
    fileIds: [],
  };
}

function expectString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('字段值类型错误');
  }
  if (value.length > maxLength) {
    throw new BadRequestException('字段值超过长度限制');
  }
  return value;
}

function expectStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new BadRequestException('字段值类型错误');
  }
  if (value.length > maxItems) {
    throw new BadRequestException('字段值数量超过限制');
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (seen.has(item)) {
      throw new BadRequestException('字段值重复');
    }
    seen.add(item);
  }
  return value;
}

function expectIsoDate(value: unknown): string {
  const text = expectString(value, 64);
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/,
  );
  if (!match) {
    throw new BadRequestException('date 字段必须是 ISO 8601 日期字符串');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new BadRequestException('date 字段必须是 ISO 8601 日期字符串');
  }
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    throw new BadRequestException('date 字段必须是 ISO 8601 日期字符串');
  }
  return text;
}

function isSelectField(type: FormFieldType): boolean {
  return type === 'single_select' || type === 'multi_select';
}

function requirePermission(actor: FormActorContext, permission: string): void {
  if (!actor.permissionCodes.includes(permission)) {
    throw new NotFoundException('表单资源不存在');
  }
}

function actorToFileActor(actor: FormActorContext): FileActorContext {
  return {
    enterpriseId: actor.enterpriseId,
    userId: actor.userId,
    permissionCodes: actor.permissionCodes,
  };
}
