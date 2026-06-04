import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  FILE_STORAGE_ALLOWED_EXTENSIONS,
  FILE_STORAGE_ALLOWED_MEDIA_TYPES,
  FILE_STORAGE_MAX_ORIGINAL_NAME_LENGTH,
  type FileStorageAllowedMediaType,
} from '@work/files-contract';
import { FILES_STORAGE_CONFIG, type FilesStorageConfig } from '../config/files-storage.config';
import { DISK_SPACE_PROBE, type DiskSpaceProbe } from './disk-space';

export interface StoredLocalFile {
  provider: 'local-disk';
  storageKey: string;
  originalName: string;
  mediaType: FileStorageAllowedMediaType;
  sizeBytes: number;
  sha256: string;
}

export interface StoreLocalFileInput {
  enterpriseId: string;
  originalName: string;
  mediaType: string;
  content: Uint8Array;
}

@Injectable()
export class LocalFileStorageProvider {
  private writeLock: Promise<void> = Promise.resolve();

  constructor(
    @Inject(FILES_STORAGE_CONFIG) private readonly config: FilesStorageConfig,
    @Inject(DISK_SPACE_PROBE) private readonly diskSpaceProbe: DiskSpaceProbe,
  ) {}

  async store(input: StoreLocalFileInput): Promise<StoredLocalFile> {
    if (input.content.byteLength === 0) {
      throw new BadRequestException('文件不能为空');
    }
    if (input.content.byteLength > this.config.maxBytes) {
      throw new BadRequestException('文件超过大小限制');
    }

    const originalName = sanitizeOriginalName(input.originalName);
    const mediaType = assertAllowedMediaType(input.mediaType);
    assertExtensionMatchesMediaType(originalName, mediaType);
    assertMagicBytes(input.content, mediaType);

    return this.withWriteLock(async () => {
      await fsp.mkdir(this.config.localRoot, { recursive: true });
      await this.assertDiskHasSpace(input.content.byteLength);

      const storageKey = createStorageKey(input.enterpriseId);
      const finalPath = this.resolveStorageKey(storageKey);
      const tempPath = this.resolveStorageKey(`${storageKey}.${randomUUID()}.tmp`);

      await fsp.mkdir(path.dirname(finalPath), { recursive: true });
      try {
        await fsp.writeFile(tempPath, input.content, { flag: 'wx' });
        await fsp.rename(tempPath, finalPath);
      } catch (error) {
        await fsp.rm(tempPath, { force: true }).catch(() => undefined);
        throw error;
      }

      return {
        provider: 'local-disk',
        storageKey,
        originalName,
        mediaType,
        sizeBytes: input.content.byteLength,
        sha256: createHash('sha256').update(input.content).digest('hex'),
      };
    });
  }

  open(storageKey: string): AsyncIterable<Uint8Array> {
    const absolutePath = this.resolveStorageKey(storageKey);
    return Readable.toWeb(fs.createReadStream(absolutePath)) as unknown as AsyncIterable<Uint8Array>;
  }

  async delete(storageKey: string): Promise<void> {
    const absolutePath = this.resolveStorageKey(storageKey);
    await fsp.rm(absolutePath, { force: true });
  }

  private resolveStorageKey(storageKey: string): string {
    if (storageKey.includes('\\') || path.isAbsolute(storageKey) || storageKey.includes('..')) {
      throw new BadRequestException('文件不存在');
    }

    const absoluteRoot = path.resolve(this.config.localRoot);
    const absolutePath = path.resolve(absoluteRoot, ...storageKey.split('/'));
    const relative = path.relative(absoluteRoot, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException('文件不存在');
    }
    return absolutePath;
  }

  private async assertDiskHasSpace(incomingBytes: number): Promise<void> {
    const snapshot = await this.diskSpaceProbe.get(this.config.localRoot);
    const freeAfterWrite = snapshot.freeBytes - incomingBytes;
    const projectedRatio = snapshot.totalBytes > 0 ? freeAfterWrite / snapshot.totalBytes : 0;
    if (
      freeAfterWrite < this.config.minFreeBytes ||
      projectedRatio < this.config.minFreeRatio
    ) {
      throw new ServiceUnavailableException('文件存储空间不足，请稍后重试');
    }
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    let release: () => void = () => undefined;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.writeLock;
    this.writeLock = previous.then(() => next);
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function createStorageKey(enterpriseId: string): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${enterpriseId}/${year}/${month}/${randomUUID()}`;
}

export function sanitizeOriginalName(input: string): string {
  const fallback = 'file';
  const withoutControls = [...input]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .trim();
  const basename = path.basename(withoutControls).replace(/[\\/]/g, '');
  const normalized = basename || fallback;
  return normalized.length > FILE_STORAGE_MAX_ORIGINAL_NAME_LENGTH
    ? normalized.slice(0, FILE_STORAGE_MAX_ORIGINAL_NAME_LENGTH)
    : normalized;
}

function assertAllowedMediaType(mediaType: string): FileStorageAllowedMediaType {
  if (!FILE_STORAGE_ALLOWED_MEDIA_TYPES.includes(mediaType as FileStorageAllowedMediaType)) {
    throw new BadRequestException('不支持的文件类型');
  }
  return mediaType as FileStorageAllowedMediaType;
}

function assertExtensionMatchesMediaType(name: string, mediaType: FileStorageAllowedMediaType): void {
  const extension = path.extname(name).toLowerCase();
  if (!FILE_STORAGE_ALLOWED_EXTENSIONS[mediaType].includes(extension)) {
    throw new BadRequestException('文件扩展名与类型不匹配');
  }
}

function assertMagicBytes(content: Uint8Array, mediaType: FileStorageAllowedMediaType): void {
  if (mediaType === 'image/jpeg' && hasPrefix(content, [0xff, 0xd8, 0xff])) {
    return;
  }
  if (mediaType === 'image/png' && hasPrefix(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return;
  }
  if (
    mediaType === 'image/webp' &&
    hasAsciiAt(content, 'RIFF', 0) &&
    hasAsciiAt(content, 'WEBP', 8)
  ) {
    return;
  }
  if (mediaType === 'application/pdf' && hasAsciiAt(content, '%PDF', 0)) {
    return;
  }
  if (
    (mediaType === 'text/plain' || mediaType === 'text/csv') &&
    isPrintableText(content)
  ) {
    return;
  }
  throw new BadRequestException('文件内容与声明类型不匹配');
}

function hasPrefix(content: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => content[index] === value);
}

function hasAsciiAt(content: Uint8Array, ascii: string, offset: number): boolean {
  return [...ascii].every((character, index) => content[offset + index] === character.charCodeAt(0));
}

function isPrintableText(content: Uint8Array): boolean {
  return content.every((byte) => byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e));
}
