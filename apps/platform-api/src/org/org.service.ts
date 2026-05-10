import { Inject, Injectable } from '@nestjs/common';
import type { CreateDepartmentInput } from '@work/platform-contract';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class OrgService {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  listEnterprises() {
    return {
      items: this.repository.listEnterprises(),
    };
  }

  listDepartments() {
    return {
      items: this.repository.listDepartments(),
    };
  }

  createDepartment(input: CreateDepartmentInput) {
    return this.repository.createDepartment(input);
  }
}
