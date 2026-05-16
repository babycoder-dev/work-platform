import { describe, expect, it } from 'vitest';
import { platformSeedPermissions } from './seed-data';

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
});
