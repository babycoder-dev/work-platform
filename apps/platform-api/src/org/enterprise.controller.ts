import { Controller, Get } from '@nestjs/common';
import { OrgService } from './org.service';

@Controller('enterprises')
export class EnterpriseController {
  constructor(private readonly orgService: OrgService) {}

  @Get()
  listEnterprises() {
    return this.orgService.listEnterprises();
  }
}
