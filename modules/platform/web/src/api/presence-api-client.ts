import type { HttpClient } from '@work/http-client';
import type { EmployeePresence } from './presence-types';

export interface PresenceApiClient {
  getEmployeePresence(employeeId: string): Promise<EmployeePresence>;
}

export function createPresenceApiClient(http: HttpClient): PresenceApiClient {
  return {
    getEmployeePresence(employeeId) {
      return http.get<EmployeePresence>(
        `status-records/by-employee/${encodeURIComponent(employeeId)}`,
      );
    },
  };
}
