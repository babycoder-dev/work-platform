import type { MenuDto, PermissionDto } from '@work/platform-contract';

export const DEFAULT_ENTERPRISE_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_DEPARTMENT_ID = '00000000-0000-0000-0000-000000000002';
export const DEFAULT_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000003';
export const DEFAULT_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000004';

export const platformSeedPermissions: PermissionDto[] = [
  { code: 'platform:org:view', name: '查看组织', moduleName: 'platform' },
  { code: 'platform:org:manage', name: '管理组织', moduleName: 'platform' },
  { code: 'platform:employee:view', name: '查看员工', moduleName: 'platform' },
  { code: 'platform:employee:create', name: '创建员工', moduleName: 'platform' },
  { code: 'platform:employee:manage', name: '管理员工', moduleName: 'platform' },
  { code: 'platform:role:view', name: '查看角色', moduleName: 'platform' },
  { code: 'platform:role:manage', name: '管理角色', moduleName: 'platform' },
  { code: 'platform:permission:view', name: '查看权限', moduleName: 'platform' },

  // M2-1 placeholder permissions for upcoming modules. M2-2 must migrate these
  // declarations behind the module manifest registration boundary.
  { code: 'presence:board:view', name: '查看在位看板', moduleName: 'presence' },
  { code: 'presence:status:create', name: '登记在位状态', moduleName: 'presence' },
  { code: 'approval:task:approve', name: '处理审批任务', moduleName: 'approval' },
  { code: 'report:weekly:view', name: '查看周报', moduleName: 'report' },
];

export const platformSeedMenus: MenuDto[] = [
  {
    id: '00000000-0000-0000-0000-000000000101',
    moduleName: 'platform',
    title: '组织架构',
    path: '/platform/org',
    permissionCode: 'platform:org:view',
    sortOrder: 10,
    status: 'active',
  },
  {
    id: '00000000-0000-0000-0000-000000000102',
    moduleName: 'platform',
    title: '员工管理',
    path: '/platform/employees',
    permissionCode: 'platform:employee:view',
    sortOrder: 20,
    status: 'active',
  },
  {
    id: '00000000-0000-0000-0000-000000000103',
    moduleName: 'platform',
    title: '角色权限',
    path: '/platform/roles',
    permissionCode: 'platform:role:view',
    sortOrder: 30,
    status: 'active',
  },
  {
    id: '00000000-0000-0000-0000-000000000104',
    moduleName: 'presence',
    title: '在位看板',
    path: '/presence/board',
    permissionCode: 'presence:board:view',
    sortOrder: 100,
    status: 'active',
  },
];
