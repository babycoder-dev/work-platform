// Local mirror of the presence public contract. Platform web consumes presence through HTTP only;
// cross-module contract imports are intentionally avoided.
export type PresenceStatus = 'working' | 'business_trip' | 'field_research' | 'out' | 'leave';

export interface PresenceStatusRecord {
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
}

export interface EmployeePresence {
  record: PresenceStatusRecord | null;
}
