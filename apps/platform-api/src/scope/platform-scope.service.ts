import { Inject, Injectable } from '@nestjs/common';
import type {
  CurrentUserDto,
  PlatformDataType,
  PlatformScope,
  PlatformScopeKind,
  PlatformScopePort,
} from '@work/platform-contract';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

export const EFFECTIVE_SCOPE_ORDER: PlatformScopeKind[] = [
  'company',
  'department_tree',
  'department',
  'self',
];

@Injectable()
export class PlatformScopeService implements PlatformScopePort {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async resolveScope(user: CurrentUserDto, dataType: PlatformDataType): Promise<PlatformScope> {
    const scopesForType = user.dataScopes[dataType] ?? [];
    const rawKind = EFFECTIVE_SCOPE_ORDER.find((kind) => scopesForType.includes(kind)) ?? 'self';
    const hasCustom = scopesForType.includes('custom');
    const hasEffective = EFFECTIVE_SCOPE_ORDER.some((kind) => scopesForType.includes(kind));

    let effectiveKind: PlatformScopeKind = rawKind;
    const degradedFromCustom = hasCustom && !hasEffective;

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
