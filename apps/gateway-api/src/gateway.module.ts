import { Module } from '@nestjs/common';
import { PresenceModule } from '@work/presence-api';
import { HealthController } from './system/health.controller';

@Module({
  imports: [PresenceModule],
  controllers: [HealthController],
})
export class GatewayModule {}
