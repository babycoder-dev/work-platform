import type { MenuDto } from '@work/platform-contract';
import type { WorkWebModule } from '@work/platform-sdk';
import { describe, expect, it } from 'vitest';
import { buildNavigationItems, findRouteMatch, resolveShellRoute } from './navigation';

describe('workbench navigation', () => {
  it('builds navigation from active platform menus in platform order', () => {
    const menus: MenuDto[] = [
      {
        id: 'menu-disabled',
        moduleName: 'presence',
        title: '隐藏',
        path: '/presence/hidden',
        sortOrder: 1,
        status: 'disabled',
      },
      {
        id: 'menu-late',
        moduleName: 'platform',
        title: '员工管理',
        path: '/platform/employees',
        permissionCode: 'platform:employee:view',
        sortOrder: 20,
        status: 'active',
      },
      {
        id: 'menu-early',
        moduleName: 'presence',
        title: '在位看板',
        path: '/presence/board',
        permissionCode: 'presence:board:view',
        sortOrder: 10,
        status: 'active',
      },
    ];

    expect(buildNavigationItems(menus)).toEqual([
      {
        title: '在位看板',
        path: '/presence/board',
        moduleName: 'presence',
        permissionCode: 'presence:board:view',
      },
      {
        title: '员工管理',
        path: '/platform/employees',
        moduleName: 'platform',
        permissionCode: 'platform:employee:view',
      },
    ]);
  });

  it('only matches module routes allowed by the current user permissions', () => {
    const modules = createModules();

    expect(findRouteMatch(modules, '/presence/board', [])).toBeUndefined();
    expect(findRouteMatch(modules, '/presence/board', ['presence:board:view'])?.module.manifest.name).toBe(
      'presence',
    );
  });

  it('resolves shell route states for home, protected routes, pending pages, and unknown paths', () => {
    const modules = createModules();
    const navigationItems = [
      {
        title: '员工管理',
        path: '/platform/employees',
        moduleName: 'platform',
        permissionCode: 'platform:employee:view',
      },
    ];

    expect(resolveShellRoute(modules, navigationItems, '/', [])).toEqual({ kind: 'home' });
    expect(resolveShellRoute(modules, navigationItems, '/presence/board', [])).toEqual({
      kind: 'forbidden',
      path: '/presence/board',
    });
    expect(resolveShellRoute(modules, navigationItems, '/platform/employees', ['platform:employee:view'])).toEqual({
      kind: 'coming-soon',
      item: navigationItems[0],
    });
    expect(resolveShellRoute(modules, navigationItems, '/missing', [])).toEqual({
      kind: 'not-found',
      path: '/missing',
    });
  });
});

function createModules(): WorkWebModule[] {
  return [
    {
      manifest: {
        name: 'presence',
        title: '在位管理',
        basePath: '/presence',
        apiPrefix: '/api/presence',
        menus: [],
        permissions: [],
        routes: [],
      },
      routes: [
        {
          path: '/presence/board',
          permission: 'presence:board:view',
          load: async () => ({
            default: function Page() {
              return undefined;
            },
          }),
        },
      ],
    },
  ];
}
