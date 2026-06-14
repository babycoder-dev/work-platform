import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FilesStorageConfig } from '../config/files-storage.config';
import type { DiskSpaceProbe } from './disk-space';
import { LocalFileStorageProvider, sanitizeOriginalName } from './local-file-storage.provider';

describe('LocalFileStorageProvider', () => {
  let root: string;
  let provider: LocalFileStorageProvider;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'work-files-provider-'));
    provider = new LocalFileStorageProvider(config(root), diskSpace());
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stores with server-generated key and sha256 without using original path', async () => {
    const stored = await provider.store({
      enterpriseId: 'ent-default',
      originalName: '..\\avatar.png',
      mediaType: 'image/png',
      content: pngBytes(),
    });

    expect(stored.storageKey).toMatch(/^ent-default\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
    expect(stored.originalName).toBe('avatar.png');
    expect(stored.sha256).toHaveLength(64);
    const resolved = path.resolve(root, ...stored.storageKey.split('/'));
    await expect(fs.stat(resolved)).resolves.toBeTruthy();
  });

  it('rejects forged mime and mismatched extension', async () => {
    await expect(
      provider.store({
        enterpriseId: 'ent-default',
        originalName: 'avatar.png',
        mediaType: 'image/png',
        content: Buffer.from('not a png'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      provider.store({
        enterpriseId: 'ent-default',
        originalName: 'avatar.txt',
        mediaType: 'image/png',
        content: pngBytes(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      provider.store({
        enterpriseId: 'ent-default',
        originalName: 'payload.docx',
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        content: Buffer.from('PK\u0003\u0004[Content_Types].xml word/document.xml'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects empty and oversized files', async () => {
    await expect(
      provider.store({
        enterpriseId: 'ent-default',
        originalName: 'empty.txt',
        mediaType: 'text/plain',
        content: Buffer.alloc(0),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const smallLimitProvider = new LocalFileStorageProvider(
      { ...config(root), maxBytes: 4 },
      diskSpace(),
    );
    await expect(
      smallLimitProvider.store({
        enterpriseId: 'ent-default',
        originalName: 'big.txt',
        mediaType: 'text/plain',
        content: Buffer.from('hello'),
      }),
    ).rejects.toThrow('文件超过大小限制');
  });

  it('sanitizes control characters and caps the display name', () => {
    expect(sanitizeOriginalName(`bad\u0000name.txt`)).toBe('badname.txt');
    expect(sanitizeOriginalName('..\\avatar.png')).toBe('avatar.png');
    expect(sanitizeOriginalName('../avatar.png')).toBe('avatar.png');
    expect(sanitizeOriginalName(`${'a'.repeat(300)}.txt`)).toHaveLength(255);
  });

  it('rejects uploads that would cross projected disk thresholds', async () => {
    const tightProvider = new LocalFileStorageProvider(
      { ...config(root), minFreeBytes: 8, minFreeRatio: 0.5 },
      {
        async get() {
          return { freeBytes: 10, totalBytes: 20 };
        },
      },
    );

    await expect(
      tightProvider.store({
        enterpriseId: 'ent-default',
        originalName: 'note.txt',
        mediaType: 'text/plain',
        content: Buffer.from('hello'),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

function config(root: string): FilesStorageConfig {
  return {
    localRoot: root,
    maxBytes: 100,
    stagedTtlMs: 24 * 60 * 60 * 1000,
    tenantQuotaBytes: 100,
    userQuotaBytes: 100,
    uploadsPerMinute: 20,
    uploadBytesPerHour: 200,
    minFreeBytes: 1,
    minFreeRatio: 0,
    cleanupIntervalMs: 0,
    repositoryDriver: 'memory',
  };
}

function diskSpace(): DiskSpaceProbe {
  return {
    async get() {
      return { freeBytes: 1024 * 1024, totalBytes: 1024 * 1024 };
    },
  };
}

function pngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}
