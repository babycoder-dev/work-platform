import type { DataScope, PermissionDto } from './rbac';
import type { PlatformDataType } from './scope';

export interface LoginInput {
  account: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  user: CurrentUserDto;
}

export interface CurrentUserDto {
  id: string;
  account: string;
  employeeNo: string;
  name: string;
  enterpriseId: string;
  departmentId?: string;
  departmentName?: string;
  roles: string[];
  permissions: PermissionDto[];
  dataScopes: Record<PlatformDataType, DataScope[]>;
  mustChangePassword: boolean;
}

export interface PasswordPolicyDto {
  minLength: number;
  requireNumber: boolean;
  requireUppercase: boolean;
  requireSpecialChar: boolean;
  maxFailedAttempts: number;
  lockDurationMinutes: number;
  expireDays?: number;
}

export interface ChangePasswordInput {
  oldPassword: string;
  newPassword: string;
}
