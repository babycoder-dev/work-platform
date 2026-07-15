import type { HttpClient } from '@work/http-client';
import type {
  CreatePresenceStatusRecordInput,
  CreatePresenceStatusTypeInput,
  PresenceBoardEntryDto,
  PresenceStatusRecordDto,
  PresenceStatusTypeDto,
  UpdatePresenceStatusTypeInput,
} from '@work/presence-contract';

export interface PresenceApiClient {
  getBoard(): Promise<PresenceBoardEntryDto[]>;
  listMyRecords(): Promise<PresenceStatusRecordDto[]>;
  createRecord(input: CreatePresenceStatusRecordInput): Promise<PresenceStatusRecordDto>;
  cancelRecord(id: string): Promise<PresenceStatusRecordDto>;
  listStatusTypes(): Promise<PresenceStatusTypeDto[]>;
  listAllStatusTypes(): Promise<PresenceStatusTypeDto[]>;
  createStatusType(input: CreatePresenceStatusTypeInput): Promise<PresenceStatusTypeDto>;
  updateStatusType(id: string, input: UpdatePresenceStatusTypeInput): Promise<PresenceStatusTypeDto>;
  setDefaultStatusType(id: string): Promise<PresenceStatusTypeDto>;
  archiveStatusType(id: string): Promise<PresenceStatusTypeDto>;
  restoreStatusType(id: string): Promise<PresenceStatusTypeDto>;
}

export function createPresenceApiClient(http: HttpClient): PresenceApiClient {
  return {
    async getBoard() {
      const response = await http.get<{ items: PresenceBoardEntryDto[] }>('board');
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
    listStatusTypes() {
      return http.get<PresenceStatusTypeDto[]>('status-types');
    },
    listAllStatusTypes() {
      return http.get<PresenceStatusTypeDto[]>('status-types/all');
    },
    createStatusType(input) {
      return http.post<PresenceStatusTypeDto, CreatePresenceStatusTypeInput>('status-types', input);
    },
    updateStatusType(id, input) {
      return http.patch<PresenceStatusTypeDto, UpdatePresenceStatusTypeInput>(
        `status-types/${encodeURIComponent(id)}`,
        input,
      );
    },
    setDefaultStatusType(id) {
      return http.post<PresenceStatusTypeDto>(
        `status-types/${encodeURIComponent(id)}/default`,
      );
    },
    archiveStatusType(id) {
      return http.post<PresenceStatusTypeDto>(
        `status-types/${encodeURIComponent(id)}/archive`,
      );
    },
    restoreStatusType(id) {
      return http.post<PresenceStatusTypeDto>(
        `status-types/${encodeURIComponent(id)}/restore`,
      );
    },
  };
}
