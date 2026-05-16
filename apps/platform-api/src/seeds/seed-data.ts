import type { PermissionDto } from '@work/platform-contract';

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
  { code: 'presence:board:view', name: '查看在位看板', moduleName: 'presence' },
  { code: 'presence:status:create', name: '登记在位状态', moduleName: 'presence' },
  { code: 'approval:task:approve', name: '处理审批任务', moduleName: 'approval' },
  { code: 'report:weekly:view', name: '查看周报', moduleName: 'report' },
];
