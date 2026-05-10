import { Injectable } from '@nestjs/common';
import type { CreateRoleInput } from '@work/platform-contract';
import { PlatformMemoryStore } from '../store/platform-memory.store';

@Injectable()
export class RbacService {
  constructor(private readonly store: PlatformMemoryStore) {}

  listPermissions() {
    return {
      items: this.store.listPermissions(),
    };
  }

  listRoles() {
    return {
      items: this.store.listRoles(),
    };
  }

  createRole(input: CreateRoleInput) {
    return this.store.createRole(input);
  }
}
