import { randomUUID } from 'node:crypto';
import type {
  CreatePresenceStatusRecordInput,
  PresenceStatusRecordDto,
} from '@work/presence-contract';
import type {
  PresenceRepository,
  PresenceRepositoryActorContext,
  PresenceRepositoryCancelInput,
  PresenceRepositoryListActiveRecordsQuery,
  PresenceRepositoryOverlapQuery,
} from './presence.repository';

export class InMemoryPresenceRepository implements PresenceRepository {
  readonly records: PresenceStatusRecordDto[] = [];

  async listActiveRecords(query: PresenceRepositoryListActiveRecordsQuery): Promise<PresenceStatusRecordDto[]> {
    const atTime = Date.parse(query.at);
    return this.records
      .filter((record) => record.enterpriseId === query.enterpriseId)
      .filter((record) => record.cancelledAt === undefined)
      .filter((record) => Date.parse(record.startAt) <= atTime)
      .filter((record) => record.endAt === undefined || Date.parse(record.endAt) > atTime)
      .filter((record) => query.userIds === undefined || query.userIds.includes(record.userId))
      .filter((record) => query.departmentIds === undefined || query.departmentIds.includes(record.departmentId))
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
    };

    this.records.push(record);
    return record;
  }

  async cancelRecord(input: PresenceRepositoryCancelInput): Promise<PresenceStatusRecordDto | undefined> {
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

  async findOverlappingRecord(query: PresenceRepositoryOverlapQuery): Promise<PresenceStatusRecordDto | undefined> {
    const start = Date.parse(query.startAt);
    const end = query.endAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(query.endAt);
    const candidates = this.records.filter((record) => {
      if (record.enterpriseId !== query.enterpriseId) return false;
      if (record.userId !== query.userId) return false;
      if (record.cancelledAt !== undefined) return false;
      if (record.status === 'working') return false;
      const recordStart = Date.parse(record.startAt);
      const recordEnd = record.endAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(record.endAt);
      return recordStart < end && recordEnd > start;
    });
    if (candidates.length === 0) {
      return undefined;
    }
    return candidates.sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''))[0];
  }
}

function byStartDescCreatedDesc(a: PresenceStatusRecordDto, b: PresenceStatusRecordDto): number {
  const startCompare = Date.parse(b.startAt) - Date.parse(a.startAt);
  if (startCompare !== 0) {
    return startCompare;
  }
  return Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '');
}
