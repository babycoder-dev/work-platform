export type EmployeeStatus = 'active' | 'disabled' | 'left';

export interface EmployeeDto {
  id: string;
  enterpriseId: string;
  employeeNo: string;
  account: string;
  name: string;
  departmentId?: string;
  title?: string;
  mobile?: string;
  email?: string;
  status: EmployeeStatus;
  roleIds: string[];
  mustChangePassword: boolean;
}

export interface CreateEmployeeInput {
  enterpriseId: string;
  employeeNo: string;
  account: string;
  name: string;
  departmentId?: string;
  title?: string;
  mobile?: string;
  email?: string;
  initialPassword: string;
}

export interface UpdateEmployeeStatusInput {
  status: EmployeeStatus;
}

export interface ResetEmployeePasswordInput {
  newPassword: string;
}

export interface EmployeeLookupDto {
  id: string;
  employeeNo: string;
  name: string;
  departmentId?: string;
  departmentName?: string;
}

export interface PlatformEmployeeLookupPort {
  listEmployeesByIds(enterpriseId: string, ids: string[]): Promise<EmployeeLookupDto[]>;
}

export const PLATFORM_EMPLOYEE_LOOKUP_SERVICE = Symbol.for('PLATFORM_EMPLOYEE_LOOKUP_SERVICE');
