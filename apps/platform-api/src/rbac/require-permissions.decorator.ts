import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_METADATA = 'platform:required-permissions';

export function RequirePermissions(...permissions: string[]) {
  return SetMetadata(REQUIRED_PERMISSIONS_METADATA, permissions);
}
