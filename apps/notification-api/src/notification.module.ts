import { Module } from '@nestjs/common';
import { NotificationController } from './notification/notification.controller';
import { NotificationService } from './notification/notification.service';
import { HealthController } from './system/health.controller';

@Module({
  controllers: [HealthController, NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
