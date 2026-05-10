import type { PermissionDefinition } from '@work/platform-sdk';

export const presencePermissions = {
  boardView: 'presence:board:view',
  statusCreate: 'presence:status:create',
  statusManage: 'presence:status:manage',
} as const;

export const presencePermissionDefinitions: PermissionDefinition[] = [
  {
    code: presencePermissions.boardView,
    name: '查看在位看板',
  },
  {
    code: presencePermissions.statusCreate,
    name: '登记本人在位状态',
  },
  {
    code: presencePermissions.statusManage,
    name: '管理团队在位状态',
  },
];
