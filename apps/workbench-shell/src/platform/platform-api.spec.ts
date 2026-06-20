import { createHttpClient } from '@work/http-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlatformApiClient } from './platform-api';

vi.mock('@work/http-client', () => ({
  createHttpClient: vi.fn(),
}));

const http = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
};

describe('createPlatformApiClient', () => {
  beforeEach(() => {
    vi.mocked(createHttpClient).mockReturnValue(http as never);
    http.get.mockReset();
    http.post.mockReset();
    http.put.mockReset();
  });

  it('calls the first-login profile and password endpoints through the platform base API', async () => {
    http.post.mockResolvedValueOnce({ success: true });
    http.get
      .mockResolvedValueOnce({
        minLength: 8,
        requireNumber: true,
        requireUppercase: false,
        requireSpecialChar: false,
        maxFailedAttempts: 5,
        lockDurationMinutes: 15,
      })
      .mockResolvedValueOnce({ id: 'user-001', name: '张三' });
    http.put.mockResolvedValueOnce({ id: 'user-001', name: '张三', mobile: '13900000000' });

    const client = createPlatformApiClient({
      baseUrl: 'http://127.0.0.1/api/platform/',
      getAccessToken: () => 'token-001',
    });

    await client.changePassword({ oldPassword: 'old-password', newPassword: 'new-password1' });
    await expect(client.getPasswordPolicy()).resolves.toMatchObject({ minLength: 8 });
    await expect(client.getMyProfile()).resolves.toMatchObject({ id: 'user-001' });
    await expect(
      client.updateMyProfile({ name: '张三', mobile: '13900000000', title: null }),
    ).resolves.toMatchObject({ mobile: '13900000000' });

    expect(http.post).toHaveBeenCalledWith('auth/change-password', {
      oldPassword: 'old-password',
      newPassword: 'new-password1',
    });
    expect(http.get).toHaveBeenCalledWith('auth/password-policy');
    expect(http.get).toHaveBeenCalledWith('employees/me');
    expect(http.put).toHaveBeenCalledWith('employees/me/profile', {
      name: '张三',
      mobile: '13900000000',
      title: null,
    });
  });
});
