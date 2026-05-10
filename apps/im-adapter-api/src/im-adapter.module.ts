import { Module } from '@nestjs/common';
import { HealthController } from './system/health.controller';
import { OpenImWebhookController } from './webhook/openim-webhook.controller';
import { ImNotificationController } from './notification/im-notification.controller';
import { OpenImProviderService } from './providers/openim-provider.service';

@Module({
  controllers: [HealthController, OpenImWebhookController, ImNotificationController],
  providers: [OpenImProviderService],
})
export class ImAdapterModule {}
