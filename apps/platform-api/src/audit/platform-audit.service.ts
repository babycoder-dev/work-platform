import { Inject, Injectable } from '@nestjs/common';
import type { CreateAuditLogInput, PlatformAuditPort } from '@work/platform-contract';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class PlatformAuditService implements PlatformAuditPort {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async record(input: CreateAuditLogInput): Promise<void> {
    await this.repository.recordAuditLog(input);
  }
}
