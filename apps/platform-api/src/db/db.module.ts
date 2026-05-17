import { Module } from '@nestjs/common';
import { PLATFORM_DB_POOL, PlatformDbPoolLifecycle, platformDbPoolProvider } from './db.provider';

@Module({
  providers: [platformDbPoolProvider, PlatformDbPoolLifecycle],
  exports: [PLATFORM_DB_POOL],
})
export class DbModule {}
