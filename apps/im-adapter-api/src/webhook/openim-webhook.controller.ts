import { Body, Controller, Post } from '@nestjs/common';
import type { ImWebhookEvent } from '@work/im-provider';
import { OpenImProviderService } from '../providers/openim-provider.service';

@Controller('webhooks/openim')
export class OpenImWebhookController {
  constructor(private readonly imProvider: OpenImProviderService) {}

  @Post()
  async receiveWebhook(@Body() payload: unknown) {
    const event: ImWebhookEvent = {
      provider: 'openim',
      eventType: 'openim.raw',
      payload,
    };

    await this.imProvider.handleWebhook(event);

    return {
      success: true,
    };
  }
}
