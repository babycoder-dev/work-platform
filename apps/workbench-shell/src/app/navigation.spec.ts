import type { MenuDto } from '@work/platform-contract';
import type { WorkWebModule } from '@work/platform-sdk';
import { describe, expect, it } from 'vitest';
import { buildModuleRouteTable, buildNavigationGroups, buildNavigationItems } from './navigation';

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

  it('builds grouped navigation from parentId while preserving ungrouped menus', () => {
    const menus: MenuDto[] = [
      {
        id: 'group-platform',
        moduleName: 'platform',
        title: '平台管理',
        path: '/platform',
        sortOrder: 1,
        status: 'active',
      },
      {
        id: 'employee',
        moduleName: 'platform',
        parentId: 'group-platform',
        title: '员工管理',
        path: '/platform/employees',
        permissionCode: 'platform:employee:view',
        sortOrder: 2,
        status: 'active',
      },
      {
        id: 'presence',
        moduleName: 'presence',
        title: '在位看板',
        path: '/presence/board',
        permissionCode: 'presence:board:view',
        sortOrder: 3,
        status: 'active',
      },
    ];

    expect(buildNavigationGroups(menus)).toEqual([
      {
        id: 'group-platform',
        title: '平台管理',
        moduleName: 'platform',
        items: [
          {
            id: 'employee',
            title: '员工管理',
            path: '/platform/employees',
            moduleName: 'platform',
            permissionCode: 'platform:employee:view',
            parentId: 'group-platform',
            sortOrder: 2,
          },
        ],
      },
      {
        id: 'ungrouped-presence',
        title: 'presence',
        moduleName: 'presence',
        items: [
          {
            id: 'presence',
            title: '在位看板',
            path: '/presence/board',
            moduleName: 'presence',
            permissionCode: 'presence:board:view',
            parentId: undefined,
            sortOrder: 3,
          },
        ],
      },
    ]);
  });

  it('keeps menus visible when their parent group is not present', () => {
    const menus: MenuDto[] = [
      {
        id: 'presence',
        moduleName: 'presence',
        parentId: 'missing-parent',
        title: '在位看板',
        path: '/presence/board',
        permissionCode: 'presence:board:view',
        sortOrder: 3,
        status: 'active',
      },
    ];

    expect(buildNavigationGroups(menus)).toEqual([
      {
        id: 'ungrouped-presence',
        title: 'presence',
        moduleName: 'presence',
        items: [
          {
            id: 'presence',
            title: '在位看板',
            path: '/presence/board',
            moduleName: 'presence',
            permissionCode: 'presence:board:view',
            parentId: 'missing-parent',
            sortOrder: 3,
          },
        ],
      },
    ]);
  });

  describe('buildModuleRouteTable', () => {
    it('flattens module routes in module and route order with normalized paths', () => {
      const modules = [
        ...createModules(),
        {
          manifest: {
            name: 'platform',
            title: '平台管理',
            basePath: '/platform',
            apiPrefix: '/api/platform',
            menus: [],
            permissions: [],
            routes: [],
          },
          routes: [
            {
              path: '/platform/employees',
              permission: 'platform:employee:view',
              load: async () => ({
                default: function Page() {
                  return undefined;
                },
              }),
            },
          ],
        },
      ];

      expect(
        buildModuleRouteTable(modules).map((route) => ({
          path: route.path,
          permission: route.permission,
        })),
      ).toEqual([
        {
          path: '/presence/board',
          permission: 'presence:board:view',
        },
        {
          path: '/presence/register',
          permission: 'presence:status:create',
        },
        {
          path: '/platform/employees',
          permission: 'platform:employee:view',
        },
      ]);
    });

    it('throws when different module paths normalize to the same route path', () => {
      const modules = [
        createModule('first', '/x'),
        createModule('second', 'x'),
      ];

      expect(() => buildModuleRouteTable(modules)).toThrow(/Duplicate module route path/);
    });

    it('throws when one module registers duplicate route paths', () => {
      const modules = [
        {
          ...createModule('presence', '/presence/board'),
          routes: [
            createRoute('/presence/board'),
            createRoute('/presence/board'),
          ],
        },
      ];

      expect(() => buildModuleRouteTable(modules)).toThrow(/Duplicate module route path/);
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
          path: 'presence/board',
          permission: 'presence:board:view',
          load: async () => ({
            default: function Page() {
              return undefined;
            },
          }),
        },
        {
          path: '/presence/register',
          permission: 'presence:status:create',
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

function createModule(name: string, path: string): WorkWebModule {
  return {
    manifest: {
      name,
      title: name,
      basePath: `/${name}`,
      apiPrefix: `/api/${name}`,
      menus: [],
      permissions: [],
      routes: [],
    },
    routes: [createRoute(path)],
  };
}

function createRoute(path: string) {
  return {
    path,
    load: async () => ({
      default: function Page() {
        return undefined;
      },
    }),
  };
}
