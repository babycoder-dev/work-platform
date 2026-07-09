import { randomUUID } from 'node:crypto';
import { ApiError } from '@work/errors';
import type {
  CreatePresenceStatusRecordInput,
  PresenceStatusRecordDto,
  PresenceStatusTypeDto,
  PresenceStatusTypeStatus,
} from '@work/presence-contract';
import type {
  PresenceRepository,
  PresenceRepositoryActorContext,
  PresenceRepositoryCancelInput,
  PresenceRepositoryListActiveRecordsQuery,
  PresenceRepositoryOverlapQuery,
  PresenceStatusTypePatch,
} from './presence.repository';

const PRESET_STATUS_TYPES = [
  { key: 'working', label: '在岗', isDefault: true, sortOrder: 10 },
  { key: 'business_trip', label: '出差', isDefault: false, sortOrder: 20 },
  { key: 'field_research', label: '外出调研', isDefault: false, sortOrder: 30 },
  { key: 'out', label: '外出', isDefault: false, sortOrder: 40 },
  { key: 'leave', label: '休假', isDefault: false, sortOrder: 50 },
] as const;

export class InMemoryPresenceRepository implements PresenceRepository {
  readonly records: PresenceStatusRecordDto[] = [];
  readonly statusTypes: PresenceStatusTypeDto[] = [];

  async listActiveRecords(
    query: PresenceRepositoryListActiveRecordsQuery,
  ): Promise<PresenceStatusRecordDto[]> {
    const atTime = Date.parse(query.at);
    return this.records
      .filter((record) => record.enterpriseId === query.enterpriseId)
      .filter((record) => record.cancelledAt === undefined)
      .filter((record) => Date.parse(record.startAt) <= atTime)
      .filter((record) => record.endAt === undefined || Date.parse(record.endAt) > atTime)
      .filter((record) => query.userIds === undefined || query.userIds.includes(record.userId))
      .filter(
        (record) =>
          query.departmentIds === undefined || query.departmentIds.includes(record.departmentId),
      )
      .filter((record) => query.status === undefined || record.status === query.status)
      .sort(byStartDescCreatedDesc);
  }

  async listUserRecords(enterpriseId: string, userId: string): Promise<PresenceStatusRecordDto[]> {
    return this.records
      .filter((record) => record.enterpriseId === enterpriseId && record.userId === userId)
      .sort(byStartDescCreatedDesc);
  }

  async createRecord(
    input: CreatePresenceStatusRecordInput,
    actor: PresenceRepositoryActorContext,
    options?: { formRecordId?: string },
  ): Promise<PresenceStatusRecordDto> {
    const now = new Date().toISOString();
    const record: PresenceStatusRecordDto = {
      id: randomUUID(),
      enterpriseId: actor.enterpriseId,
      userId: actor.userId,
      employeeNo: actor.employeeNo,
      userName: actor.userName,
      departmentId: actor.departmentId,
      departmentName: actor.departmentName,
      status: input.status,
      startAt: input.startAt,
      endAt: input.endAt,
      remark: input.remark,
      createdBy: actor.userId,
      createdAt: now,
      formRecordId: options?.formRecordId,
    };

    this.records.push(record);
    return record;
  }

  async cancelRecord(
    input: PresenceRepositoryCancelInput,
  ): Promise<PresenceStatusRecordDto | undefined> {
    const index = this.records.findIndex(
      (record) => record.id === input.recordId && record.cancelledAt === undefined,
    );
    if (index === -1) {
      return undefined;
    }

    const updated: PresenceStatusRecordDto = {
      ...this.records[index],
      cancelledAt: input.cancelledAt,
    };
    this.records[index] = updated;
    return updated;
  }

  async findOverlappingRecord(
    query: PresenceRepositoryOverlapQuery,
  ): Promise<PresenceStatusRecordDto | undefined> {
    const start = Date.parse(query.startAt);
    const end = query.endAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(query.endAt);
    const candidates = this.records.filter((record) => {
      if (record.enterpriseId !== query.enterpriseId) return false;
      if (record.userId !== query.userId) return false;
      if (record.cancelledAt !== undefined) return false;
      if (record.status === query.exemptStatusKey) return false;
      const recordStart = Date.parse(record.startAt);
      const recordEnd =
        record.endAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(record.endAt);
      return recordStart < end && recordEnd > start;
    });
    if (candidates.length === 0) {
      return undefined;
    }
    return candidates.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  }

  async ensurePresetStatusTypes(enterpriseId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const preset of PRESET_STATUS_TYPES) {
      if (
        this.statusTypes.some(
          (type) => type.enterpriseId === enterpriseId && type.key === preset.key,
        )
      ) {
        continue;
      }
      this.statusTypes.push({
        id: randomUUID(),
        enterpriseId,
        key: preset.key,
        label: preset.label,
        isPreset: true,
        isDefault: preset.isDefault,
        status: 'active',
        sortOrder: preset.sortOrder,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async listStatusTypes(
    enterpriseId: string,
    options: { includeArchived: boolean },
  ): Promise<PresenceStatusTypeDto[]> {
    return this.statusTypes
      .filter((type) => type.enterpriseId === enterpriseId)
      .filter((type) => options.includeArchived || type.status === 'active')
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          Date.parse(left.createdAt) - Date.parse(right.createdAt),
      )
      .map((type) => ({ ...type }));
  }

  async findStatusTypeById(
    enterpriseId: string,
    id: string,
  ): Promise<PresenceStatusTypeDto | undefined> {
    const type = this.statusTypes.find(
      (candidate) => candidate.enterpriseId === enterpriseId && candidate.id === id,
    );
    return type ? { ...type } : undefined;
  }

  async findStatusTypeByKey(
    enterpriseId: string,
    key: string,
  ): Promise<PresenceStatusTypeDto | undefined> {
    const type = this.statusTypes.find(
      (candidate) => candidate.enterpriseId === enterpriseId && candidate.key === key,
    );
    return type ? { ...type } : undefined;
  }

  async createStatusType(input: {
    enterpriseId: string;
    key: string;
    label: string;
    sortOrder: number;
    createdBy: string;
  }): Promise<PresenceStatusTypeDto> {
    if (
      this.statusTypes.some(
        (type) => type.enterpriseId === input.enterpriseId && type.key === input.key,
      )
    ) {
      throw new ApiError('PRESENCE_DUPLICATE_RESOURCE', '状态类型 key 已存在', {
        status: 409,
      });
    }
    const now = new Date().toISOString();
    const created: PresenceStatusTypeDto = {
      id: randomUUID(),
      enterpriseId: input.enterpriseId,
      key: input.key,
      label: input.label,
      isPreset: false,
      isDefault: false,
      status: 'active',
      sortOrder: input.sortOrder,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.statusTypes.push(created);
    return { ...created };
  }

  async updateStatusType(
    enterpriseId: string,
    id: string,
    patch: PresenceStatusTypePatch,
  ): Promise<PresenceStatusTypeDto | undefined> {
    const index = this.statusTypes.findIndex(
      (type) => type.enterpriseId === enterpriseId && type.id === id,
    );
    if (index === -1) return undefined;
    const updated = {
      ...this.statusTypes[index],
      ...(patch.label === undefined ? {} : { label: patch.label }),
      ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
      updatedAt: new Date().toISOString(),
    };
    this.statusTypes[index] = updated;
    return { ...updated };
  }

  async setDefaultStatusType(
    enterpriseId: string,
    id: string,
  ): Promise<PresenceStatusTypeDto | undefined> {
    const target = this.statusTypes.find(
      (type) => type.enterpriseId === enterpriseId && type.id === id && type.status === 'active',
    );
    if (!target) return undefined;
    const now = new Date().toISOString();
    for (let index = 0; index < this.statusTypes.length; index += 1) {
      const type = this.statusTypes[index];
      if (type.enterpriseId === enterpriseId) {
        this.statusTypes[index] = {
          ...type,
          isDefault: type.id === id,
          updatedAt: now,
        };
      }
    }
    return this.findStatusTypeById(enterpriseId, id);
  }

  async setStatusTypeStatus(
    enterpriseId: string,
    id: string,
    status: PresenceStatusTypeStatus,
  ): Promise<PresenceStatusTypeDto | undefined> {
    const index = this.statusTypes.findIndex(
      (type) => type.enterpriseId === enterpriseId && type.id === id,
    );
    if (index === -1) return undefined;
    if (status === 'archived' && this.statusTypes[index].isDefault) return undefined;
    const updated = {
      ...this.statusTypes[index],
      status,
      updatedAt: new Date().toISOString(),
    };
    this.statusTypes[index] = updated;
    return { ...updated };
  }
}

function byStartDescCreatedDesc(a: PresenceStatusRecordDto, b: PresenceStatusRecordDto): number {
  const startCompare = Date.parse(b.startAt) - Date.parse(a.startAt);
  if (startCompare !== 0) {
    return startCompare;
  }
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}
