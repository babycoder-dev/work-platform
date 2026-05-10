export interface EnterpriseDto {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'disabled';
}

export interface DepartmentDto {
  id: string;
  enterpriseId: string;
  name: string;
  code: string;
  parentId?: string;
  managerUserId?: string;
  sortOrder: number;
  status: 'active' | 'disabled';
}

export interface CreateDepartmentInput {
  enterpriseId: string;
  name: string;
  code: string;
  parentId?: string;
  managerUserId?: string;
  sortOrder?: number;
}
