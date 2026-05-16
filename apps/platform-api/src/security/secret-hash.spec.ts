import { describe, expect, it } from 'vitest';
import { hashAccessToken, hashPassword, verifyPassword } from './secret-hash';

describe('secret hash utilities', () => {
  it('hashes passwords with salt and verifies the original password', () => {
    const firstHash = hashPassword('AdminPassw0rd');
    const secondHash = hashPassword('AdminPassw0rd');

    expect(firstHash).toContain('scrypt$v=1$');
    expect(secondHash).toContain('scrypt$v=1$');
    expect(firstHash).not.toBe(secondHash);
    expect(firstHash).not.toContain('AdminPassw0rd');
    expect(verifyPassword('AdminPassw0rd', firstHash)).toBe(true);
    expect(verifyPassword('wrong-password', firstHash)).toBe(false);
  });

  it('rejects unsupported password hash formats', () => {
    expect(verifyPassword('AdminPassw0rd', 'plain-text')).toBe(false);
    expect(verifyPassword('AdminPassw0rd', 'argon2id$v=1$params$salt$hash')).toBe(false);
  });

  it('hashes access tokens deterministically without storing the token value', () => {
    const token = 'dev-access-token';
    const hash = hashAccessToken(token);

    expect(hashAccessToken(token)).toBe(hash);
    expect(hashAccessToken('another-token')).not.toBe(hash);
    expect(hash).not.toContain(token);
  });
});
