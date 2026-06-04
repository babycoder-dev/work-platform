import fs from 'node:fs/promises';

export interface DiskSpaceSnapshot {
  freeBytes: number;
  totalBytes: number;
}

export interface DiskSpaceProbe {
  get(path: string): Promise<DiskSpaceSnapshot>;
}

export const DISK_SPACE_PROBE = Symbol.for('DISK_SPACE_PROBE');

export class NodeDiskSpaceProbe implements DiskSpaceProbe {
  async get(path: string): Promise<DiskSpaceSnapshot> {
    const stats = await fs.statfs(path);
    return {
      freeBytes: Number(stats.bavail) * Number(stats.bsize),
      totalBytes: Number(stats.blocks) * Number(stats.bsize),
    };
  }
}
