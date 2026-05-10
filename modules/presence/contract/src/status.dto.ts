import type { PresenceStatus } from './events';

export interface PresenceStatusRecordDto {
  id: string;
  userId: string;
  userName: string;
  departmentId: string;
  departmentName: string;
  status: PresenceStatus;
  startAt: string;
  endAt?: string;
  remark?: string;
}

export interface CreatePresenceStatusRecordInput {
  status: PresenceStatus;
  startAt: string;
  endAt?: string;
  remark?: string;
}

export interface PresenceBoardQuery {
  departmentId?: string;
  status?: PresenceStatus;
  date?: string;
}
