import { describe, expect, it } from 'vitest';
import { platformModuleManifests, platformSeedMenus, platformSeedPermissions } from './seed-data';

describe('platform seed data', () => {
  it('declares unique permission codes for platform bootstrap', () => {
    const permissionCodes = platformSeedPermissions.map((permission) => permission.code);

    expect(new Set(permissionCodes).size).toBe(permissionCodes.length);
    expect(permissionCodes).toEqual(
      expect.arrayContaining([
        'platform:org:view',
        'platform:employee:create',
        'platform:role:manage',
        'presence:board:view',
        'approval:task:approve',
        'report:weekly:view',
      ]),
    );
  });

  it('uses module manifests as the seed source for permissions and menus', () => {
    const moduleNames = platformModuleManifests.map((manifest) => manifest.moduleName);
    const manifestPermissionCodes = platformModuleManifests.flatMap((manifest) =>
      manifest.permissions.map((permission) => permission.code),
    );
    const manifestMenuIds = platformModuleManifests.flatMap((manifest) =>
      manifest.menus.map((menu) => menu.id),
    );

    expect(new Set(moduleNames).size).toBe(moduleNames.length);
    expect(platformSeedPermissions.map((permission) => permission.code)).toEqual(manifestPermissionCodes);
    expect(platformSeedMenus.map((menu) => menu.id)).toEqual(manifestMenuIds);
    for (const manifest of platformModuleManifests) {
      expect(manifest.permissions.every((permission) => permission.moduleName === manifest.moduleName)).toBe(true);
      expect(manifest.menus.every((menu) => menu.moduleName === manifest.moduleName)).toBe(true);
    }
  });
});
