import type { PermissionDefinition } from '@work/platform-sdk';

export const formsPermissions = {
  profileDefinitionView: 'forms:profile-definition:view',
  profileDefinitionManage: 'forms:profile-definition:manage',
  reportDefinitionView: 'forms:report-definition:view',
  reportDefinitionManage: 'forms:report-definition:manage',
  recordSubmit: 'forms:record:submit',
  recordView: 'forms:record:view',
} as const;

export const formsPermissionDefinitions: PermissionDefinition[] = [
  {
    code: formsPermissions.profileDefinitionView,
    name: '查看档案表单定义',
  },
  {
    code: formsPermissions.profileDefinitionManage,
    name: '管理档案表单定义',
  },
  {
    code: formsPermissions.reportDefinitionView,
    name: '查看汇报表单定义',
  },
  {
    code: formsPermissions.reportDefinitionManage,
    name: '管理汇报表单定义',
  },
  {
    code: formsPermissions.recordSubmit,
    name: '提交表单记录',
  },
  {
    code: formsPermissions.recordView,
    name: '查看表单记录',
  },
];
