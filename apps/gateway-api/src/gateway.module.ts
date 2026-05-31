import { Module } from '@nestjs/common';
import { APP_GUARD, RouterModule } from '@nestjs/core';
import { PermissionGuard } from '@work/nest-common';
import { PlatformAuthGuard, PlatformModule } from '@work/platform-api';
import { PresenceModule } from '@work/presence-api';
import { HealthController } from './system/health.controller';

@Module({
  imports: [
    PlatformModule,
    PresenceModule,
    RouterModule.register([
      {
        path: 'platform',
        module: PlatformModule,
      },
    ]),
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: PlatformAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
})
export class GatewayModule {}
