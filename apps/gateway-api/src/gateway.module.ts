import { Module } from '@nestjs/common';
import { APP_GUARD, RouterModule } from '@nestjs/core';
import { FilesModule } from '@work/files-api';
import { FormsModule } from '@work/forms-api';
import { PermissionGuard } from '@work/nest-common';
import { NotificationModule } from '@work/notification-api';
import { PlatformAuthGuard, PlatformModule } from '@work/platform-api';
import { PresenceModule } from '@work/presence-api';
import { HealthController } from './system/health.controller';

@Module({
  imports: [
    PlatformModule,
    FilesModule,
    FormsModule,
    NotificationModule,
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
