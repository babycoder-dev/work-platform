import type { ModuleManifestDto } from '@work/platform-contract';
import { formsPermissions } from './permissions';

export const FORMS_MODULE_MANIFEST_ID = '00000000-0000-0000-0000-000000000205';

export const formsPlatformManifest: ModuleManifestDto = {
  id: FORMS_MODULE_MANIFEST_ID,
  moduleName: 'forms',
  displayName: '动态表单',
  description: '档案、在位、汇报等业务复用的固定槽位动态表单基建',
  apiPrefix: '/api/forms',
  status: 'active',
  permissions: [
    { code: formsPermissions.profileDefinitionView, name: '查看档案表单定义', moduleName: 'forms' },
    {
      code: formsPermissions.profileDefinitionManage,
      name: '管理档案表单定义',
      moduleName: 'forms',
    },
    { code: formsPermissions.reportDefinitionView, name: '查看汇报表单定义', moduleName: 'forms' },
    {
      code: formsPermissions.reportDefinitionManage,
      name: '管理汇报表单定义',
      moduleName: 'forms',
    },
    { code: formsPermissions.recordSubmit, name: '提交表单记录', moduleName: 'forms' },
    { code: formsPermissions.recordView, name: '查看表单记录', moduleName: 'forms' },
  ],
  menus: [],
};
