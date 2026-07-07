import { Global, Module } from '@nestjs/common';
import { FormsModule } from '@work/forms-api';
import { PRESENCE_FORMS_LINK } from '@work/presence-api';
import { GatewayPresenceFormsLink } from './presence-forms-link.adapter';

@Global()
@Module({
  imports: [FormsModule],
  providers: [
    GatewayPresenceFormsLink,
    {
      provide: PRESENCE_FORMS_LINK,
      useExisting: GatewayPresenceFormsLink,
    },
  ],
  exports: [PRESENCE_FORMS_LINK],
})
export class PresenceFormsLinkModule {}
