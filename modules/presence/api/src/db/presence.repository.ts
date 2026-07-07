import type {
  CreatePresenceStatusRecordInput,
  PresenceStatus,
  PresenceStatusRecordDto,
  PresenceStatusTypeDto,
  PresenceStatusTypeStatus,
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
  exemptStatusKey: string;
}

export interface PresenceStatusTypePatch {
  label?: string;
  sortOrder?: number;
}

export interface PresenceRepository {
  listActiveRecords(
    query: PresenceRepositoryListActiveRecordsQuery,
  ): Promise<PresenceStatusRecordDto[]>;
  listUserRecords(enterpriseId: string, userId: string): Promise<PresenceStatusRecordDto[]>;
  createRecord(
    input: CreatePresenceStatusRecordInput,
    actor: PresenceRepositoryActorContext,
    options?: { formRecordId?: string },
  ): Promise<PresenceStatusRecordDto>;
  cancelRecord(input: PresenceRepositoryCancelInput): Promise<PresenceStatusRecordDto | undefined>;
  findOverlappingRecord(
    query: PresenceRepositoryOverlapQuery,
  ): Promise<PresenceStatusRecordDto | undefined>;
  ensurePresetStatusTypes(enterpriseId: string): Promise<void>;
  listStatusTypes(
    enterpriseId: string,
    options: { includeArchived: boolean },
  ): Promise<PresenceStatusTypeDto[]>;
  findStatusTypeById(enterpriseId: string, id: string): Promise<PresenceStatusTypeDto | undefined>;
  findStatusTypeByKey(
    enterpriseId: string,
    key: string,
  ): Promise<PresenceStatusTypeDto | undefined>;
  createStatusType(input: {
    enterpriseId: string;
    key: string;
    label: string;
    sortOrder: number;
    createdBy: string;
  }): Promise<PresenceStatusTypeDto>;
  updateStatusType(
    enterpriseId: string,
    id: string,
    patch: PresenceStatusTypePatch,
  ): Promise<PresenceStatusTypeDto | undefined>;
  setDefaultStatusType(
    enterpriseId: string,
    id: string,
  ): Promise<PresenceStatusTypeDto | undefined>;
  setStatusTypeStatus(
    enterpriseId: string,
    id: string,
    status: PresenceStatusTypeStatus,
  ): Promise<PresenceStatusTypeDto | undefined>;
}
