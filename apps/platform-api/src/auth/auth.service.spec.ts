import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { PlatformMemoryStore } from '../store/platform-memory.store';

describe('AuthService', () => {
  it('logs in with the seeded admin account', async () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);

    const result = await service.login({
      account: 'admin',
      password: 'admin123',
    });

    expect(result.accessToken).toContain('dev-access-');
    expect(result.user.name).toBe('系统管理员');
    expect(result.user.permissions.length).toBeGreaterThan(0);
  });

  it('authenticates issued access tokens', async () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);
    const login = await service.login({
      account: 'admin',
      password: 'admin123',
    });

    const currentUser = await service.authenticateAccessToken(login.accessToken);

    expect(currentUser.id).toBe('user-admin');
    expect(currentUser.permissions.map((permission) => permission.code)).toContain('platform:org:view');
  });

  it('rejects unknown access tokens', async () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);

    await expect(service.authenticateAccessToken('dev-access-missing')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects expired access sessions', async () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);
    await store.createAccessSession({
      accessToken: 'dev-access-expired',
      userId: 'user-admin',
      expiresAt: '2000-01-01T00:00:00.000Z',
    });

    await expect(service.authenticateAccessToken('dev-access-expired')).rejects.toThrow(UnauthorizedException);
  });
});
