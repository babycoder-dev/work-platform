import { Module } from '@nestjs/common';
import { PlatformRealtimeGateway } from './realtime/platform-realtime.gateway';
import { HealthController } from './system/health.controller';

@Module({
  controllers: [HealthController],
  providers: [PlatformRealtimeGateway],
})
export class RealtimeModule {}
