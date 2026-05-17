import { Inject, Injectable } from '@nestjs/common';
import type { CreateDepartmentInput } from '@work/platform-contract';
import { PLATFORM_REPOSITORY, type PlatformRepository } from '../repositories/platform.repository';

@Injectable()
export class OrgService {
  constructor(@Inject(PLATFORM_REPOSITORY) private readonly repository: PlatformRepository) {}

  async listEnterprises() {
    return {
      items: await this.repository.listEnterprises(),
    };
  }

  async listDepartments() {
    return {
      items: await this.repository.listDepartments(),
    };
  }

  async createDepartment(input: CreateDepartmentInput) {
    return this.repository.createDepartment(input);
  }
}
