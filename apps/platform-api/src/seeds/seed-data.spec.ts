import { approvalPlatformManifest } from '@work/approval-contract';
import { filesPlatformManifest } from '@work/files-contract';
import { formsPlatformManifest } from '@work/forms-contract';
import { notificationPlatformManifest, notificationPermissions } from '@work/notification-contract';
import { presencePlatformManifest } from '@work/presence-contract';
import { reportPlatformManifest } from '@work/report-contract';
import { describe, expect, it } from 'vitest';
import { platformModuleManifest } from './platform-module-manifest';
import { platformModuleManifests, platformSeedMenus, platformSeedPermissions } from './seed-data';

describe('platform seed data', () => {
  it('lists every module manifest including disabled ones', () => {
    expect(platformModuleManifests).toEqual([
      platformModuleManifest,
      filesPlatformManifest,
      formsPlatformManifest,
      notificationPlatformManifest,
      presencePlatformManifest,
      approvalPlatformManifest,
      reportPlatformManifest,
    ]);
  });

  it('sources the platform module manifest from platform-api', () => {
    expect(platformModuleManifests.find((manifest) => manifest.moduleName === 'platform')).toBe(
      platformModuleManifest,
    );
  });

  it('sources business module manifests from contract packages', () => {
    const byName = new Map(
      platformModuleManifests.map((manifest) => [manifest.moduleName, manifest]),
    );
    expect(byName.get('files')).toBe(filesPlatformManifest);
    expect(byName.get('forms')).toBe(formsPlatformManifest);
    expect(byName.get('notification')).toBe(notificationPlatformManifest);
    expect(byName.get('presence')).toBe(presencePlatformManifest);
    expect(byName.get('approval')).toBe(approvalPlatformManifest);
    expect(byName.get('report')).toBe(reportPlatformManifest);
  });

  it('keeps approval and report manifests disabled until their backends ship', () => {
    expect(approvalPlatformManifest.status).toBe('disabled');
    expect(reportPlatformManifest.status).toBe('disabled');
  });

  it('only derives permissions and menus from active manifests', () => {
    const expectedPermissionCodes = platformModuleManifests
      .filter((manifest) => manifest.status === 'active')
      .flatMap((manifest) => manifest.permissions.map((permission) => permission.code));
    const expectedMenuIds = platformModuleManifests
      .filter((manifest) => manifest.status === 'active')
      .flatMap((manifest) => manifest.menus.map((menu) => menu.id));

    expect(platformSeedPermissions.map((permission) => permission.code)).toEqual(
      expectedPermissionCodes,
    );
    expect(platformSeedMenus.map((menu) => menu.id)).toEqual(expectedMenuIds);
    expect(platformSeedPermissions.map((permission) => permission.code)).not.toContain(
      'approval:task:approve',
    );
    expect(platformSeedPermissions.map((permission) => permission.code)).not.toContain(
      'report:weekly:view',
    );
  });

  it('declares the presence management permission and registration menu', () => {
    expect(platformSeedPermissions.map((permission) => permission.code)).toEqual(
      expect.arrayContaining([
        'files:object:upload',
        'files:object:view-own',
        'forms:profile-definition:view',
        'forms:profile-definition:manage',
        'forms:presence-definition:view',
        'forms:presence-definition:manage',
        'forms:report-definition:view',
        'forms:report-definition:manage',
        'forms:record:submit',
        'forms:record:view',
        notificationPermissions.triggerConfigManage,
        'presence:board:view',
        'presence:status:create',
        'presence:status:manage',
      ]),
    );
    expect(platformSeedPermissions.map((permission) => permission.code)).toContain(
      'forms:presence-definition:view',
    );
    expect(platformSeedPermissions.map((permission) => permission.code)).toContain(
      'forms:presence-definition:manage',
    );
    expect(platformSeedMenus.map((menu) => menu.path)).toEqual(
      expect.arrayContaining(['/presence/board', '/presence/register']),
    );
  });

  it('keeps module manifest names unique', () => {
    const moduleNames = platformModuleManifests.map((manifest) => manifest.moduleName);
    expect(new Set(moduleNames).size).toBe(moduleNames.length);
  });

  it('keeps every permission and menu scoped to its declaring module', () => {
    for (const manifest of platformModuleManifests) {
      expect(
        manifest.permissions.every((permission) => permission.moduleName === manifest.moduleName),
      ).toBe(true);
      expect(manifest.menus.every((menu) => menu.moduleName === manifest.moduleName)).toBe(true);
    }
  });
});
