import type { CurrentUserDto } from '@work/platform-contract';

export interface PlatformRequest {
  headers?: Record<string, string | string[] | undefined>;
  currentUser?: CurrentUserDto;
}
