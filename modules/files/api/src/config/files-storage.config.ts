import path from 'node:path';
import process from 'node:process';
import {
  FILE_STORAGE_DEFAULT_CLEANUP_INTERVAL_MS,
  FILE_STORAGE_DEFAULT_MAX_BYTES,
  FILE_STORAGE_DEFAULT_MIN_FREE_BYTES,
  FILE_STORAGE_DEFAULT_MIN_FREE_RATIO,
  FILE_STORAGE_DEFAULT_STAGED_TTL_HOURS,
  FILE_STORAGE_DEFAULT_TENANT_QUOTA_BYTES,
  FILE_STORAGE_DEFAULT_UPLOAD_BYTES_PER_HOUR,
  FILE_STORAGE_DEFAULT_UPLOADS_PER_MINUTE,
  FILE_STORAGE_DEFAULT_USER_QUOTA_BYTES,
} from '@work/files-contract';

export interface FilesStorageConfig {
  localRoot: string;
  maxBytes: number;
  stagedTtlMs: number;
  tenantQuotaBytes: number;
  userQuotaBytes: number;
  uploadsPerMinute: number;
  uploadBytesPerHour: number;
  minFreeBytes: number;
  minFreeRatio: number;
  cleanupIntervalMs: number;
  repositoryDriver: 'postgres' | 'memory';
}

export const FILES_STORAGE_CONFIG = Symbol.for('FILES_STORAGE_CONFIG');

export function readFilesStorageConfig(): FilesStorageConfig {
  const configuredRoot = process.env.FILE_STORAGE_LOCAL_ROOT;
  if (!configuredRoot && process.env.NODE_ENV === 'production') {
    throw new Error('FILE_STORAGE_LOCAL_ROOT is required in production');
  }

  const defaultDevRoot = path.resolve(process.cwd(), '.work-platform-files');

  return {
    localRoot: path.resolve(configuredRoot ?? defaultDevRoot),
    maxBytes: readPositiveInt('FILE_STORAGE_MAX_BYTES', FILE_STORAGE_DEFAULT_MAX_BYTES),
    stagedTtlMs: readPositiveInt(
      'FILE_STORAGE_STAGED_TTL_HOURS',
      FILE_STORAGE_DEFAULT_STAGED_TTL_HOURS,
    ) * 60 * 60 * 1000,
    tenantQuotaBytes: readPositiveInt(
      'FILE_STORAGE_TENANT_QUOTA_BYTES',
      FILE_STORAGE_DEFAULT_TENANT_QUOTA_BYTES,
    ),
    userQuotaBytes: readPositiveInt(
      'FILE_STORAGE_USER_QUOTA_BYTES',
      FILE_STORAGE_DEFAULT_USER_QUOTA_BYTES,
    ),
    uploadsPerMinute: readPositiveInt(
      'FILE_STORAGE_UPLOADS_PER_MINUTE',
      FILE_STORAGE_DEFAULT_UPLOADS_PER_MINUTE,
    ),
    uploadBytesPerHour: readPositiveInt(
      'FILE_STORAGE_UPLOAD_BYTES_PER_HOUR',
      FILE_STORAGE_DEFAULT_UPLOAD_BYTES_PER_HOUR,
    ),
    minFreeBytes: readPositiveInt(
      'FILE_STORAGE_MIN_FREE_BYTES',
      FILE_STORAGE_DEFAULT_MIN_FREE_BYTES,
    ),
    minFreeRatio: readRatio('FILE_STORAGE_MIN_FREE_RATIO', FILE_STORAGE_DEFAULT_MIN_FREE_RATIO),
    cleanupIntervalMs: readNonNegativeInt(
      'FILE_STORAGE_CLEANUP_INTERVAL_MS',
      FILE_STORAGE_DEFAULT_CLEANUP_INTERVAL_MS,
    ),
    repositoryDriver: process.env.FILES_REPOSITORY_DRIVER === 'memory' ? 'memory' : 'postgres',
  };
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function readNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function readRatio(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }
  return parsed;
}
