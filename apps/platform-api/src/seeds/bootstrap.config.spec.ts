import { describe, expect, it } from 'vitest';
import { readPlatformBootstrapConfig } from './bootstrap.config';

describe('readPlatformBootstrapConfig', () => {
  it('uses development defaults only outside production', () => {
    const config = readPlatformBootstrapConfig({ NODE_ENV: 'development' });

    expect(config.adminAccount).toBe('admin');
    expect(config.adminPassword).toBe('admin123');
    expect(config.enterpriseCode).toBe('default');
    expect(config.resetAdminPassword).toBe(false);
  });

  it('requires an explicit production password', () => {
    expect(() => readPlatformBootstrapConfig({ NODE_ENV: 'production' })).toThrow(
      'PLATFORM_BOOTSTRAP_ADMIN_PASSWORD is required outside development and test environments.',
    );
  });

  it('rejects the development password in production', () => {
    expect(() =>
      readPlatformBootstrapConfig({
        NODE_ENV: 'production',
        PLATFORM_BOOTSTRAP_ADMIN_PASSWORD: 'admin123',
      }),
    ).toThrow('PLATFORM_BOOTSTRAP_ADMIN_PASSWORD must not use the development default in production.');
  });

  it('reads explicit bootstrap settings', () => {
    const config = readPlatformBootstrapConfig({
      NODE_ENV: 'production',
      PLATFORM_BOOTSTRAP_ADMIN_ACCOUNT: 'root',
      PLATFORM_BOOTSTRAP_ADMIN_EMPLOYEE_NO: 'A001',
      PLATFORM_BOOTSTRAP_ADMIN_NAME: 'Root Admin',
      PLATFORM_BOOTSTRAP_ADMIN_PASSWORD: 'RootPassw0rd',
      PLATFORM_BOOTSTRAP_ENTERPRISE_CODE: 'corp',
      PLATFORM_BOOTSTRAP_ENTERPRISE_NAME: 'Corp',
      PLATFORM_BOOTSTRAP_RESET_ADMIN_PASSWORD: 'true',
    });

    expect(config).toEqual({
      adminAccount: 'root',
      adminEmployeeNo: 'A001',
      adminName: 'Root Admin',
      adminPassword: 'RootPassw0rd',
      enterpriseCode: 'corp',
      enterpriseName: 'Corp',
      resetAdminPassword: true,
    });
  });
});
