import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { PlatformMemoryStore } from '../store/platform-memory.store';

describe('AuthService', () => {
  it('logs in with the seeded admin account', () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);

    const result = service.login({
      account: 'admin',
      password: 'admin123',
    });

    expect(result.accessToken).toContain('dev-access-');
    expect(result.user.name).toBe('系统管理员');
    expect(result.user.permissions.length).toBeGreaterThan(0);
  });

  it('authenticates issued access tokens', () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);
    const login = service.login({
      account: 'admin',
      password: 'admin123',
    });

    const currentUser = service.authenticateAccessToken(login.accessToken);

    expect(currentUser.id).toBe('user-admin');
    expect(currentUser.permissions.map((permission) => permission.code)).toContain('platform:org:view');
  });

  it('rejects unknown access tokens', () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);

    expect(() => service.authenticateAccessToken('dev-access-missing')).toThrow(UnauthorizedException);
  });

  it('rejects expired access sessions', () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);
    store.createAccessSession({
      accessToken: 'dev-access-expired',
      userId: 'user-admin',
      expiresAt: '2000-01-01T00:00:00.000Z',
    });

    expect(() => service.authenticateAccessToken('dev-access-expired')).toThrow(UnauthorizedException);
  });
});
