import { Controller, Get } from '@nestjs/common';
import { Public } from '@work/nest-common';

@Controller('forms/health')
export class FormsHealthController {
  @Public()
  @Get()
  health() {
    return {
      module: 'forms',
      status: 'ok',
    };
  }
}
