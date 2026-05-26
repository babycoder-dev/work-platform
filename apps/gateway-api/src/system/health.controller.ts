import { Controller, Get } from '@nestjs/common';
import { Public } from '@work/nest-common';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  getHealth() {
    return {
      status: 'ok',
      service: 'gateway-api',
    };
  }
}
