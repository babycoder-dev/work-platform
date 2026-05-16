import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const PASSWORD_HASH_ALGORITHM = 'scrypt';
const PASSWORD_HASH_VERSION = '1';
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = {
  N: 16384,
  p: 1,
  r: 8,
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);

  return [
    PASSWORD_HASH_ALGORITHM,
    `v=${PASSWORD_HASH_VERSION}`,
    `N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p},keylen=${KEY_LENGTH}`,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const parsed = parsePasswordHash(passwordHash);
  if (!parsed) {
    return false;
  }

  const derivedKey = scryptSync(password, parsed.salt, parsed.keyLength, {
    N: parsed.N,
    p: parsed.p,
    r: parsed.r,
  });

  return derivedKey.length === parsed.hash.length && timingSafeEqual(derivedKey, parsed.hash);
}

export function hashAccessToken(accessToken: string): string {
  return createHash('sha256').update(`platform-access-token:${accessToken}`).digest('base64url');
}

interface ParsedPasswordHash {
  hash: Buffer;
  keyLength: number;
  N: number;
  p: number;
  r: number;
  salt: Buffer;
}

function parsePasswordHash(passwordHash: string): ParsedPasswordHash | undefined {
  const [algorithm, version, params, saltValue, hashValue] = passwordHash.split('$');
  if (algorithm !== PASSWORD_HASH_ALGORITHM || version !== `v=${PASSWORD_HASH_VERSION}`) {
    return undefined;
  }

  const parsedParams = parseParams(params);
  if (!parsedParams || !saltValue || !hashValue) {
    return undefined;
  }

  return {
    ...parsedParams,
    hash: Buffer.from(hashValue, 'base64url'),
    salt: Buffer.from(saltValue, 'base64url'),
  };
}

function parseParams(params: string | undefined): Omit<ParsedPasswordHash, 'hash' | 'salt'> | undefined {
  if (!params) {
    return undefined;
  }

  const values = new Map(
    params.split(',').map((pair) => {
      const [key, value] = pair.split('=');
      return [key, Number(value)] as const;
    }),
  );
  const keyLength = values.get('keylen');
  const N = values.get('N');
  const p = values.get('p');
  const r = values.get('r');

  if (!keyLength || !N || !p || !r) {
    return undefined;
  }

  return { keyLength, N, p, r };
}
