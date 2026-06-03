import { approvalPlatformManifest } from '@work/approval-contract';
import { filesPlatformManifest } from '@work/files-contract';
import { formsPlatformManifest } from '@work/forms-contract';
import type { MenuDto, ModuleManifestDto, PermissionDto } from '@work/platform-contract';
import { presencePlatformManifest } from '@work/presence-contract';
import { reportPlatformManifest } from '@work/report-contract';
import { platformModuleManifest } from './platform-module-manifest';

export const DEFAULT_ENTERPRISE_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_DEPARTMENT_ID = '00000000-0000-0000-0000-000000000002';
export const DEFAULT_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000003';
export const DEFAULT_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000004';

export const platformModuleManifests: ModuleManifestDto[] = [
  platformModuleManifest,
  filesPlatformManifest,
  formsPlatformManifest,
  presencePlatformManifest,
  approvalPlatformManifest,
  reportPlatformManifest,
];

const activeModuleManifests = platformModuleManifests.filter((manifest) => manifest.status === 'active');

export const platformSeedPermissions: PermissionDto[] = activeModuleManifests.flatMap(
  (manifest) => manifest.permissions,
);

export const platformSeedMenus: MenuDto[] = activeModuleManifests.flatMap((manifest) => manifest.menus);
