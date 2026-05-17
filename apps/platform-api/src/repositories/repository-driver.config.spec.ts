import { describe, expect, it } from 'vitest';
import { readPlatformRepositoryDriver } from './repository-driver.config';

describe('readPlatformRepositoryDriver', () => {
  it('defaults to memory for local development and current unit tests', () => {
    expect(readPlatformRepositoryDriver({})).toBe('memory');
  });

  it('allows explicit postgres repository selection', () => {
    expect(readPlatformRepositoryDriver({ PLATFORM_REPOSITORY_DRIVER: 'postgres' })).toBe('postgres');
  });

  it('rejects unsupported repository drivers', () => {
    expect(() => readPlatformRepositoryDriver({ PLATFORM_REPOSITORY_DRIVER: 'sqlite' })).toThrow(
      'Unsupported PLATFORM_REPOSITORY_DRIVER: sqlite',
    );
  });
});
