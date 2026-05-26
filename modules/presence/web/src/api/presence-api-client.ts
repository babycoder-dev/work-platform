import type { HttpClient } from '@work/http-client';
import type {
  CreatePresenceStatusRecordInput,
  PresenceStatusRecordDto,
} from '@work/presence-contract';

export interface PresenceApiClient {
  getBoard(): Promise<PresenceStatusRecordDto[]>;
  listMyRecords(): Promise<PresenceStatusRecordDto[]>;
  createRecord(input: CreatePresenceStatusRecordInput): Promise<PresenceStatusRecordDto>;
  cancelRecord(id: string): Promise<PresenceStatusRecordDto>;
}

export function createPresenceApiClient(http: HttpClient): PresenceApiClient {
  return {
    getBoard() {
      return http.get<PresenceStatusRecordDto[]>('board');
    },
    listMyRecords() {
      return http.get<PresenceStatusRecordDto[]>('status-records/mine');
    },
    createRecord(input) {
      return http.post<PresenceStatusRecordDto, CreatePresenceStatusRecordInput>('status-records', input);
    },
    cancelRecord(id) {
      return http.delete<PresenceStatusRecordDto>(`status-records/${encodeURIComponent(id)}`);
    },
  };
}
