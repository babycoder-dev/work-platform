import type { DataScope, PermissionDto } from './rbac';

export interface LoginInput {
  account: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: CurrentUserDto;
}

export interface CurrentUserDto {
  id: string;
  employeeNo: string;
  name: string;
  enterpriseId: string;
  departmentId?: string;
  departmentName?: string;
  roles: string[];
  permissions: PermissionDto[];
  dataScopes: DataScope[];
}

export interface PasswordPolicyDto {
  minLength: number;
  requireNumber: boolean;
  requireUppercase: boolean;
  requireSpecialChar: boolean;
  maxFailedAttempts: number;
  expireDays?: number;
}
