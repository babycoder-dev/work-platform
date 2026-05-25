import type {
  CreatePresenceStatusRecordInput,
  PresenceStatus,
  PresenceStatusRecordDto,
} from '@work/presence-contract';

export interface PresenceRepositoryActorContext {
  enterpriseId: string;
  userId: string;
  employeeNo: string;
  userName: string;
  departmentId: string;
  departmentName: string;
}

export interface PresenceRepositoryListActiveRecordsQuery {
  enterpriseId: string;
  at: string;
  userIds?: string[];
  departmentIds?: string[];
  status?: PresenceStatus;
}

export interface PresenceRepositoryCancelInput {
  recordId: string;
  actorUserId: string;
  cancelledAt: string;
}

export interface PresenceRepositoryOverlapQuery {
  enterpriseId: string;
  userId: string;
  startAt: string;
  endAt?: string;
}

export interface PresenceRepository {
  listActiveRecords(query: PresenceRepositoryListActiveRecordsQuery): Promise<PresenceStatusRecordDto[]>;
  listUserRecords(enterpriseId: string, userId: string): Promise<PresenceStatusRecordDto[]>;
  createRecord(input: CreatePresenceStatusRecordInput, actor: PresenceRepositoryActorContext): Promise<PresenceStatusRecordDto>;
  cancelRecord(input: PresenceRepositoryCancelInput): Promise<PresenceStatusRecordDto | undefined>;
  findOverlappingRecord(query: PresenceRepositoryOverlapQuery): Promise<PresenceStatusRecordDto | undefined>;
}
