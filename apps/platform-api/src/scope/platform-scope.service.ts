import { Inject, Injectable } from '@nestjs/common';
import type { CurrentUserDto } from '@work/platform-contract';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

export type PlatformScopeKind = 'self' | 'department' | 'department_tree' | 'company';

export interface PlatformScope {
  kind: PlatformScopeKind;
  userId: string;
  enterpriseId: string;
  departmentId?: string;
  departmentIds: string[];
  degradedFromCustom: boolean;
}

export const EFFECTIVE_SCOPE_ORDER: PlatformScopeKind[] = [
  'company',
  'department_tree',
  'department',
  'self',
];

@Injectable()
export class PlatformScopeService {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async resolveScope(user: CurrentUserDto): Promise<PlatformScope> {
    const rawKind: PlatformScopeKind | 'custom' =
      EFFECTIVE_SCOPE_ORDER.find((kind) => user.dataScopes.includes(kind)) ?? 'custom';

    let effectiveKind: PlatformScopeKind = rawKind === 'custom' ? 'self' : rawKind;
    const degradedFromCustom = rawKind === 'custom';

    if (
      (effectiveKind === 'department' || effectiveKind === 'department_tree') &&
      user.departmentId === undefined
    ) {
      effectiveKind = 'self';
    }

    let departmentIds: string[] = [];
    if (effectiveKind === 'department') {
      const departmentId = user.departmentId;
      if (departmentId !== undefined) {
        departmentIds = [departmentId];
      }
    }
    if (effectiveKind === 'department_tree') {
      const departmentId = user.departmentId;
      if (departmentId === undefined) {
        departmentIds = [];
      } else {
        departmentIds = [
          departmentId,
          ...await this.repository.listDescendantDepartmentIds(departmentId, user.enterpriseId),
        ];
      }
    }

    return {
      kind: effectiveKind,
      userId: user.id,
      enterpriseId: user.enterpriseId,
      departmentId: user.departmentId,
      departmentIds: Array.from(new Set(departmentIds)),
      degradedFromCustom,
    };
  }
}
