import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { PlatformMemoryStore } from '../store/platform-memory.store';

describe('AuthService', () => {
  it('logs in with the seeded admin account', async () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);

    const result = await service.login(
      {
        account: 'admin',
        password: 'admin123',
      },
      {
        traceId: 'trace-login-unit',
        ip: '203.0.113.10',
        userAgent: 'vitest-agent',
      },
    );

    expect(result.accessToken).toContain('dev-access-');
    expect(result.user.name).toBe('系统管理员');
    expect(result.user.permissions.length).toBeGreaterThan(0);
    expect(store.auditLogs).toEqual([
      expect.objectContaining({
        action: 'auth.login',
        actorAccount: 'admin',
        traceId: 'trace-login-unit',
        ip: '203.0.113.10',
        userAgent: 'vitest-agent',
      }),
    ]);
  });

  it('does not grant permissions from disabled roles', async () => {
    const store = new PlatformMemoryStore();
    const service = new AuthService(store);
    const adminRole = store.roles.get('role-admin');
    if (!adminRole) {
      throw new Error('seed admin role missing');
    }
    store.roles.set('role-admin', {
      ...adminRole,
      status: 'disabled',
    });

    const result = await service.login({
      account: 'admin',
      password: 'admin123',
    });

    expect(result.user.roles).toEqual([]);
    expect(result.user.permissions).toEqual([]);
    expect(result.user.dataScopes).toEqual([]);
  });

  it('fails login when audit writing fails', async () => {
    const store = new PlatformMemoryStore();
    store.recordAuditLog = async () => {
      throw new Error('audit failed');
    };
    const service = new AuthService(store);

    await expect(
      service.login({
        account: 'admin',
        password: 'admin123',
      }),
    ).rejects.toThrow('audit failed');
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
