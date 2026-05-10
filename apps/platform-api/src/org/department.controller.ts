import { Body, Controller, Get, Post } from '@nestjs/common';
import type { CreateDepartmentInput } from '@work/platform-contract';
import { OrgService } from './org.service';

@Controller('departments')
export class DepartmentController {
  constructor(private readonly orgService: OrgService) {}

  @Get()
  listDepartments() {
    return this.orgService.listDepartments();
  }

  @Post()
  createDepartment(@Body() input: CreateDepartmentInput) {
    return this.orgService.createDepartment(input);
  }
}
