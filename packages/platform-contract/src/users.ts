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
  roleIds?: string[];
}

export interface UpdateEmployeeStatusInput {
  status: EmployeeStatus;
}
