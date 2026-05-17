import process from 'node:process';

export type PlatformRepositoryDriver = 'memory' | 'postgres';

export function readPlatformRepositoryDriver(env: NodeJS.ProcessEnv = process.env): PlatformRepositoryDriver {
  const driver = env.PLATFORM_REPOSITORY_DRIVER ?? 'memory';
  if (driver === 'memory' || driver === 'postgres') {
    return driver;
  }

  throw new Error(`Unsupported PLATFORM_REPOSITORY_DRIVER: ${driver}`);
}
