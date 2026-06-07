import { Controller, Get } from '@nestjs/common';
import { Public } from '@work/nest-common';

@Controller('notification/health')
export class NotificationHealthController {
  @Get()
  @Public()
  getHealth() {
    return {
      service: 'notification',
      status: 'ok',
    };
  }
}
