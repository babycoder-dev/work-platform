import type { PlatformOrgPort } from '@work/platform-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipientResolver } from './recipient-resolver';

describe('RecipientResolver', () => {
  let platformOrgPort: MockPlatformOrgPort;
  let resolver: RecipientResolver;

  beforeEach(() => {
    platformOrgPort = {
      resolveDepartmentManager: vi.fn(),
      listUserIdsByRole: vi.fn(),
    };
    resolver = new RecipientResolver(platformOrgPort);
  });

  it('resolves department manager, role users and subject, then deduplicates and excludes actor', async () => {
    platformOrgPort.resolveDepartmentManager.mockResolvedValue({ managerUserId: 'manager-1' });
    platformOrgPort.listUserIdsByRole.mockResolvedValue(['manager-1', 'actor-1', 'role-user-1']);

    await expect(
      resolver.resolve(
        [
          { kind: 'department_manager' },
          { kind: 'role', roleCode: 'hr' },
          { kind: 'subject' },
          { kind: 'self' },
          { kind: 'role' },
        ],
        {
          enterpriseId: 'ent-1',
          subjectUserId: 'subject-1',
          actorUserId: 'actor-1',
        },
      ),
    ).resolves.toEqual(['manager-1', 'role-user-1', 'subject-1']);

    expect(platformOrgPort.resolveDepartmentManager).toHaveBeenCalledWith('ent-1', 'subject-1');
    expect(platformOrgPort.listUserIdsByRole).toHaveBeenCalledWith('ent-1', 'hr');
  });

  it('skips missing department managers and roles without roleCode', async () => {
    platformOrgPort.resolveDepartmentManager.mockResolvedValue({});

    await expect(
      resolver.resolve(
        [{ kind: 'department_manager' }, { kind: 'role' }],
        {
          enterpriseId: 'ent-1',
          subjectUserId: 'subject-1',
          actorUserId: 'actor-1',
        },
      ),
    ).resolves.toEqual([]);

    expect(platformOrgPort.listUserIdsByRole).not.toHaveBeenCalled();
  });
});

interface MockPlatformOrgPort extends PlatformOrgPort {
  resolveDepartmentManager: ReturnType<typeof vi.fn>;
  listUserIdsByRole: ReturnType<typeof vi.fn>;
}
