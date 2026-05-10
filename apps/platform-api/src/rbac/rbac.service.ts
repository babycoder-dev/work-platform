import { Inject, Injectable } from '@nestjs/common';
import type { CreateRoleInput } from '@work/platform-contract';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class RbacService {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  listPermissions() {
    return {
      items: this.repository.listPermissions(),
    };
  }

  listRoles() {
    return {
      items: this.repository.listRoles(),
    };
  }

  createRole(input: CreateRoleInput) {
    return this.repository.createRole(input);
  }
}
