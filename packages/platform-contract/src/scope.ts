import type { CurrentUserDto } from './auth';

export type PlatformScopeKind = 'self' | 'department' | 'department_tree' | 'company';

export interface PlatformScope {
  kind: PlatformScopeKind;
  userId: string;
  enterpriseId: string;
  departmentId?: string;
  departmentIds: string[];
  degradedFromCustom: boolean;
}

export interface PlatformScopePort {
  resolveScope(user: CurrentUserDto): Promise<PlatformScope>;
}

export const PLATFORM_SCOPE_SERVICE = Symbol.for('PLATFORM_SCOPE_SERVICE');
