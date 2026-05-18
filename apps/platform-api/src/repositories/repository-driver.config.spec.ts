import { describe, expect, it } from 'vitest';
import { readPlatformRepositoryDriver } from './repository-driver.config';

describe('readPlatformRepositoryDriver', () => {
  it('defaults to postgres for deployable runtime paths', () => {
    expect(readPlatformRepositoryDriver({})).toBe('postgres');
  });

  it('allows explicit postgres repository selection', () => {
    expect(readPlatformRepositoryDriver({ PLATFORM_REPOSITORY_DRIVER: 'postgres' })).toBe('postgres');
  });

  it('allows explicit memory repository selection for tests and local fallback', () => {
    expect(readPlatformRepositoryDriver({ PLATFORM_REPOSITORY_DRIVER: 'memory' })).toBe('memory');
  });

  it('rejects unsupported repository drivers', () => {
    expect(() => readPlatformRepositoryDriver({ PLATFORM_REPOSITORY_DRIVER: 'sqlite' })).toThrow(
      'Unsupported PLATFORM_REPOSITORY_DRIVER: sqlite',
    );
  });
});
