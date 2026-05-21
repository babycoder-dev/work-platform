import type { WorkWebModule } from '@work/platform-sdk';

export const platformWebModule: WorkWebModule = {
  manifest: {
    name: 'platform',
    title: '平台管理',
    basePath: '/platform',
    apiPrefix: '/api/platform',
    permissions: [
      { code: 'platform:org:view', name: '查看组织' },
      { code: 'platform:employee:view', name: '查看员工' },
      { code: 'platform:role:view', name: '查看角色' },
    ],
    menus: [
      { title: '组织架构', path: '/platform/org', permission: 'platform:org:view' },
      { title: '员工管理', path: '/platform/employees', permission: 'platform:employee:view' },
      { title: '角色权限', path: '/platform/roles', permission: 'platform:role:view' },
    ],
    routes: [
      { path: '/platform/org', permission: 'platform:org:view' },
      { path: '/platform/employees', permission: 'platform:employee:view' },
      { path: '/platform/roles', permission: 'platform:role:view' },
    ],
  },
  routes: [
    {
      path: '/platform/org',
      permission: 'platform:org:view',
      load: () => import('./pages/OrganizationPage'),
    },
    {
      path: '/platform/employees',
      permission: 'platform:employee:view',
      load: () => import('./pages/EmployeesPage'),
    },
    {
      path: '/platform/roles',
      permission: 'platform:role:view',
      load: () => import('./pages/RolesPage'),
    },
  ],
};
