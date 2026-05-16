import process from 'node:process';

export interface PlatformBootstrapConfig {
  adminAccount: string;
  adminEmployeeNo: string;
  adminName: string;
  adminPassword: string;
  enterpriseCode: string;
  enterpriseName: string;
  resetAdminPassword: boolean;
}

export function readPlatformBootstrapConfig(env: NodeJS.ProcessEnv = process.env): PlatformBootstrapConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const adminPassword = env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD ?? resolveDevelopmentPassword(nodeEnv);

  if (!adminPassword) {
    throw new Error('PLATFORM_BOOTSTRAP_ADMIN_PASSWORD is required outside development and test environments.');
  }

  if (nodeEnv === 'production' && adminPassword === 'admin123') {
    throw new Error('PLATFORM_BOOTSTRAP_ADMIN_PASSWORD must not use the development default in production.');
  }

  return {
    adminAccount: env.PLATFORM_BOOTSTRAP_ADMIN_ACCOUNT ?? 'admin',
    adminEmployeeNo: env.PLATFORM_BOOTSTRAP_ADMIN_EMPLOYEE_NO ?? '000001',
    adminName: env.PLATFORM_BOOTSTRAP_ADMIN_NAME ?? '系统管理员',
    adminPassword,
    enterpriseCode: env.PLATFORM_BOOTSTRAP_ENTERPRISE_CODE ?? 'default',
    enterpriseName: env.PLATFORM_BOOTSTRAP_ENTERPRISE_NAME ?? '默认企业',
    resetAdminPassword: env.PLATFORM_BOOTSTRAP_RESET_ADMIN_PASSWORD === 'true',
  };
}

function resolveDevelopmentPassword(nodeEnv: string): string | undefined {
  if (nodeEnv === 'development' || nodeEnv === 'test') {
    return 'admin123';
  }

  return undefined;
}
