import type { ModuleManifestDto } from '@work/platform-contract';

export const PLATFORM_MODULE_MANIFEST_ID = '00000000-0000-0000-0000-000000000201';
export const PLATFORM_ORG_MENU_ID = '00000000-0000-0000-0000-000000000101';
export const PLATFORM_EMPLOYEES_MENU_ID = '00000000-0000-0000-0000-000000000102';
export const PLATFORM_ROLES_MENU_ID = '00000000-0000-0000-0000-000000000103';

export const platformModuleManifest: ModuleManifestDto = {
  id: PLATFORM_MODULE_MANIFEST_ID,
  moduleName: 'platform',
  displayName: '平台管理',
  description: '企业、组织、员工、角色、权限等平台基础能力',
  apiPrefix: '/api/platform',
  status: 'active',
  permissions: [
    { code: 'platform:org:view', name: '查看组织', moduleName: 'platform' },
    { code: 'platform:org:manage', name: '管理组织', moduleName: 'platform' },
    { code: 'platform:employee:view', name: '查看员工', moduleName: 'platform' },
    { code: 'platform:employee:create', name: '创建员工', moduleName: 'platform' },
    { code: 'platform:employee:manage', name: '管理员工', moduleName: 'platform' },
    { code: 'platform:role:view', name: '查看角色', moduleName: 'platform' },
    { code: 'platform:role:manage', name: '管理角色', moduleName: 'platform' },
    { code: 'platform:permission:view', name: '查看权限', moduleName: 'platform' },
  ],
  menus: [
    {
      id: PLATFORM_ORG_MENU_ID,
      moduleName: 'platform',
      title: '组织架构',
      path: '/platform/org',
      permissionCode: 'platform:org:view',
      sortOrder: 10,
      status: 'active',
    },
    {
      id: PLATFORM_EMPLOYEES_MENU_ID,
      moduleName: 'platform',
      title: '员工管理',
      path: '/platform/employees',
      permissionCode: 'platform:employee:view',
      sortOrder: 20,
      status: 'active',
    },
    {
      id: PLATFORM_ROLES_MENU_ID,
      moduleName: 'platform',
      title: '角色权限',
      path: '/platform/roles',
      permissionCode: 'platform:role:view',
      sortOrder: 30,
      status: 'active',
    },
  ],
};
