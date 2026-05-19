import type { MenuDto, ModuleManifestDto, PermissionDto } from '@work/platform-contract';

export const DEFAULT_ENTERPRISE_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_DEPARTMENT_ID = '00000000-0000-0000-0000-000000000002';
export const DEFAULT_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000003';
export const DEFAULT_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000004';

export const platformModuleManifests: ModuleManifestDto[] = [
  {
    id: '00000000-0000-0000-0000-000000000201',
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
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000202',
    moduleName: 'presence',
    displayName: '在位管理',
    description: '出差、外出调研、休假等在位状态登记与看板',
    apiPrefix: '/api/presence',
    webEntry: '/presence',
    status: 'active',
    permissions: [
      { code: 'presence:board:view', name: '查看在位看板', moduleName: 'presence' },
      { code: 'presence:status:create', name: '登记在位状态', moduleName: 'presence' },
    ],
    menus: [
      {
        id: '00000000-0000-0000-0000-000000000104',
        moduleName: 'presence',
        title: '在位看板',
        path: '/presence/board',
        permissionCode: 'presence:board:view',
        sortOrder: 100,
        status: 'active',
      },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000203',
    moduleName: 'approval',
    displayName: '审批',
    description: '请假、外出等轻量行政审批流程',
    apiPrefix: '/api/approval',
    webEntry: '/approval',
    status: 'active',
    permissions: [
      { code: 'approval:task:approve', name: '处理审批任务', moduleName: 'approval' },
    ],
    menus: [],
  },
  {
    id: '00000000-0000-0000-0000-000000000204',
    moduleName: 'report',
    displayName: '工作汇报',
    description: '日/周工作汇报填写与逐级汇总',
    apiPrefix: '/api/report',
    webEntry: '/report',
    status: 'active',
    permissions: [
      { code: 'report:weekly:view', name: '查看周报', moduleName: 'report' },
    ],
    menus: [],
  },
];

export const platformSeedPermissions: PermissionDto[] = platformModuleManifests.flatMap(
  (manifest) => manifest.permissions,
);

export const platformSeedMenus: MenuDto[] = platformModuleManifests.flatMap((manifest) => manifest.menus);
