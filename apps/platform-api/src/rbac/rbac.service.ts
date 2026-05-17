import { Inject, Injectable } from '@nestjs/common';
import type { CreateRoleInput } from '@work/platform-contract';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class RbacService {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async listPermissions() {
    return {
      items: await this.repository.listPermissions(),
    };
  }

  async listRoles() {
    return {
      items: await this.repository.listRoles(),
    };
  }

  async createRole(input: CreateRoleInput) {
    return this.repository.createRole(input);
  }
}
