import type { CurrentUserDto } from '@work/platform-contract';
import { describe, expect, it, vi } from 'vitest';
import type { PlatformRepository } from '../repositories/platform.repository';
import { PlatformScopeService } from './platform-scope.service';

describe('PlatformScopeService', () => {
  it('resolves company as the effective scope', async () => {
    const { service, repository } = createService();

    await expect(service.resolveScope(currentUser({ dataScopes: ['company'] }))).resolves.toEqual(
      expect.objectContaining({
        kind: 'company',
        departmentIds: [],
        degradedFromCustom: false,
      }),
    );
    expect(repository.listDescendantDepartmentIds).not.toHaveBeenCalled();
  });

  it('expands department_tree with descendants', async () => {
    const { service, repository } = createService(['dept-b', 'dept-c']);

    await expect(service.resolveScope(currentUser({ dataScopes: ['department_tree'] }))).resolves.toEqual(
      expect.objectContaining({
        kind: 'department_tree',
        departmentIds: ['dept-a', 'dept-b', 'dept-c'],
        degradedFromCustom: false,
      }),
    );
    expect(repository.listDescendantDepartmentIds).toHaveBeenCalledWith('dept-a', 'ent-default');
  });

  it('resolves department as the caller department only', async () => {
    const { service, repository } = createService();

    await expect(service.resolveScope(currentUser({ dataScopes: ['department'] }))).resolves.toEqual(
      expect.objectContaining({
        kind: 'department',
        departmentIds: ['dept-a'],
        degradedFromCustom: false,
      }),
    );
    expect(repository.listDescendantDepartmentIds).not.toHaveBeenCalled();
  });

  it('resolves self without department filtering', async () => {
    const { service } = createService();

    await expect(service.resolveScope(currentUser({ dataScopes: ['self'] }))).resolves.toEqual(
      expect.objectContaining({
        kind: 'self',
        departmentIds: [],
        degradedFromCustom: false,
      }),
    );
  });

  it('degrades custom to self', async () => {
    const { service } = createService();

    await expect(service.resolveScope(currentUser({ dataScopes: ['custom'] }))).resolves.toEqual(
      expect.objectContaining({
        kind: 'self',
        departmentIds: [],
        degradedFromCustom: true,
      }),
    );
  });

  it('degrades empty data scopes to self', async () => {
    const { service } = createService();

    await expect(service.resolveScope(currentUser({ dataScopes: [] }))).resolves.toEqual(
      expect.objectContaining({
        kind: 'self',
        departmentIds: [],
        degradedFromCustom: true,
      }),
    );
  });

  it('chooses department over custom', async () => {
    const { service } = createService();

    await expect(service.resolveScope(currentUser({ dataScopes: ['custom', 'department'] }))).resolves.toEqual(
      expect.objectContaining({
        kind: 'department',
        departmentIds: ['dept-a'],
        degradedFromCustom: false,
      }),
    );
  });

  it('chooses company as the largest scope', async () => {
    const { service } = createService();

    await expect(service.resolveScope(currentUser({ dataScopes: ['self', 'company'] }))).resolves.toEqual(
      expect.objectContaining({
        kind: 'company',
        departmentIds: [],
        degradedFromCustom: false,
      }),
    );
  });

  it('degrades department_tree to self when the caller has no department', async () => {
    const { service, repository } = createService();

    await expect(
      service.resolveScope(currentUser({ dataScopes: ['department_tree'], departmentId: undefined })),
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'self',
        departmentId: undefined,
        departmentIds: [],
        degradedFromCustom: false,
      }),
    );
    expect(repository.listDescendantDepartmentIds).not.toHaveBeenCalled();
  });

  it('deduplicates department ids after department_tree expansion', async () => {
    const { service } = createService(['dept-a', 'dept-b']);

    const scope = await service.resolveScope(currentUser({ dataScopes: ['department_tree'] }));

    expect(scope.departmentIds).toEqual(['dept-a', 'dept-b']);
    expect(scope.departmentIds.filter((id) => id === 'dept-a')).toHaveLength(1);
  });
});

function createService(descendantDepartmentIds: string[] = []) {
  const repository = {
    listDescendantDepartmentIds: vi.fn().mockResolvedValue(descendantDepartmentIds),
  } as unknown as PlatformRepository & {
    listDescendantDepartmentIds: ReturnType<typeof vi.fn>;
  };

  return {
    repository,
    service: new PlatformScopeService(repository),
  };
}

function currentUser(input: Partial<CurrentUserDto>): CurrentUserDto {
  return {
    id: 'user-a',
    account: 'user-a',
    employeeNo: 'U001',
    name: 'User A',
    enterpriseId: 'ent-default',
    departmentId: 'dept-a',
    roles: [],
    permissions: [],
    dataScopes: ['self'],
    mustChangePassword: false,
    ...input,
  };
}
