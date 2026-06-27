import type { HttpClient } from '@work/http-client';
import type { FormDefinition, FormRecord, UpsertProfileRecordInput } from './forms-types';

const PROFILE_EMPLOYEE_SLOT = 'profile.employee';

export interface FormsApiClient {
  getProfileDefinition(): Promise<FormDefinition>;
  getProfileRecord(subjectId: string): Promise<FormRecord>;
  upsertProfileRecord(subjectId: string, input: UpsertProfileRecordInput): Promise<FormRecord>;
}

export function createFormsApiClient(http: HttpClient): FormsApiClient {
  return {
    getProfileDefinition() {
      return http.get<FormDefinition>(`definitions/${PROFILE_EMPLOYEE_SLOT}`);
    },
    getProfileRecord(subjectId) {
      return http.get<FormRecord>(
        `records/${PROFILE_EMPLOYEE_SLOT}/subjects/${encodeURIComponent(subjectId)}`,
      );
    },
    upsertProfileRecord(subjectId, input) {
      return http.put<FormRecord, UpsertProfileRecordInput>(
        `records/${PROFILE_EMPLOYEE_SLOT}/subjects/${encodeURIComponent(subjectId)}`,
        input,
      );
    },
  };
}
