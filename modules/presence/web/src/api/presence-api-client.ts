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
    async getBoard() {
      const response = await http.get<{ items: PresenceStatusRecordDto[] }>('board');
      return response.items;
    },
    async listMyRecords() {
      const response = await http.get<{ items: PresenceStatusRecordDto[] }>('status-records/mine');
      return response.items;
    },
    createRecord(input) {
      return http.post<PresenceStatusRecordDto, CreatePresenceStatusRecordInput>('status-records', input);
    },
    cancelRecord(id) {
      return http.delete<PresenceStatusRecordDto>(`status-records/${encodeURIComponent(id)}`);
    },
  };
}
