import { Global, Module } from '@nestjs/common';
import { EVENT_BUS, MemoryEventBus } from '@work/event-bus';

@Global()
@Module({
  providers: [
    {
      provide: EVENT_BUS,
      useFactory: () => new MemoryEventBus(),
    },
  ],
  exports: [EVENT_BUS],
})
export class EventBusModule {}
