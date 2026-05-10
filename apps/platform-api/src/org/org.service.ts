import { Injectable } from '@nestjs/common';
import type { CreateDepartmentInput } from '@work/platform-contract';
import { PlatformMemoryStore } from '../store/platform-memory.store';

@Injectable()
export class OrgService {
  constructor(private readonly store: PlatformMemoryStore) {}

  listEnterprises() {
    return {
      items: this.store.listEnterprises(),
    };
  }

  listDepartments() {
    return {
      items: this.store.listDepartments(),
    };
  }

  createDepartment(input: CreateDepartmentInput) {
    return this.store.createDepartment(input);
  }
}
