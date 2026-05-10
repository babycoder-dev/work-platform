import { Body, Controller, Post } from '@nestjs/common';
import type { SendSystemMessageInput } from '@work/im-provider';
import { OpenImProviderService } from '../providers/openim-provider.service';

@Controller('notifications')
export class ImNotificationController {
  constructor(private readonly imProvider: OpenImProviderService) {}

  @Post('system-message')
  sendSystemMessage(@Body() input: SendSystemMessageInput) {
    return this.imProvider.sendSystemMessage(input);
  }
}
