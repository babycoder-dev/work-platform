import { ApiError } from '@work/errors';
import type { FilesClock } from './clock';

interface UploadEvent {
  atMs: number;
  sizeBytes: number;
}

export class FilesRateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly successfulBytes = new Map<string, UploadEvent[]>();

  constructor(
    private readonly clock: FilesClock,
    private readonly uploadsPerMinute: number,
    private readonly uploadBytesPerHour: number,
  ) {}

  assertAttemptAllowed(enterpriseId: string, userId: string): void {
    const key = `${enterpriseId}:${userId}`;
    const now = this.clock.now().getTime();
    const oneMinuteAgo = now - 60 * 1000;
    const recentAttempts = (this.attempts.get(key) ?? []).filter((atMs) => atMs >= oneMinuteAgo);

    if (recentAttempts.length >= this.uploadsPerMinute) {
      throw new ApiError('FILES_UPLOAD_RATE_LIMITED', '上传过于频繁，请稍后重试', { status: 429 });
    }

    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
  }

  assertSuccessfulBytesAllowed(enterpriseId: string, userId: string, sizeBytes: number): void {
    const key = `${enterpriseId}:${userId}`;
    const now = this.clock.now().getTime();
    const oneHourAgo = now - 60 * 60 * 1000;
    const recent = (this.successfulBytes.get(key) ?? []).filter((event) => event.atMs >= oneHourAgo);
    const bytesLastHour = recent.reduce((total, event) => total + event.sizeBytes, 0);

    if (bytesLastHour + sizeBytes > this.uploadBytesPerHour) {
      throw new ApiError('FILES_UPLOAD_RATE_LIMITED', '上传过于频繁，请稍后重试', { status: 429 });
    }

    this.successfulBytes.set(key, recent);
  }

  recordSuccessfulBytes(enterpriseId: string, userId: string, sizeBytes: number): void {
    const key = `${enterpriseId}:${userId}`;
    const now = this.clock.now().getTime();
    const oneHourAgo = now - 60 * 60 * 1000;
    const recent = (this.successfulBytes.get(key) ?? []).filter((event) => event.atMs >= oneHourAgo);
    recent.push({ atMs: now, sizeBytes });
    this.successfulBytes.set(key, recent);
  }
}
