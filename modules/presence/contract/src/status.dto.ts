import type { PresenceStatus } from './events';

export interface PresenceStatusRecordDto {
  id: string;
  enterpriseId: string;
  userId: string;
  employeeNo: string;
  userName: string;
  departmentId: string;
  departmentName: string;
  status: PresenceStatus;
  startAt: string;
  endAt?: string;
  remark?: string;
  createdBy: string;
  createdAt: string;
  cancelledAt?: string;
  formRecordId?: string;
}

export interface CreatePresenceStatusRecordInput {
  status: PresenceStatus;
  startAt: string;
  endAt?: string;
  remark?: string;
  form?: CreatePresenceStatusRecordFormInput;
}

export interface CreatePresenceStatusRecordFormInput {
  definitionRevision: number;
  values: Array<{ fieldKey: string; value: unknown }>;
}

export interface PresenceBoardQuery {
  departmentId?: string;
  status?: PresenceStatus;
  date?: string;
}
