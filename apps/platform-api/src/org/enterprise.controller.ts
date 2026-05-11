import { Controller, Get, Inject } from '@nestjs/common';
import { OrgService } from './org.service';

@Controller('enterprises')
export class EnterpriseController {
  constructor(@Inject(OrgService) private readonly orgService: OrgService) {}

  @Get()
  listEnterprises() {
    return this.orgService.listEnterprises();
  }
}
