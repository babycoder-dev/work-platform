import { createHttpClient } from '@work/http-client';
import type { CurrentUserDto, LoginInput, LoginResult, MenuDto } from '@work/platform-contract';

export interface PlatformSession {
  accessToken: string;
  currentUser: CurrentUserDto;
}

export interface PlatformBootstrapData {
  currentUser: CurrentUserDto;
  menus: MenuDto[];
}

export interface PlatformApiClient {
  login(input: LoginInput): Promise<PlatformSession>;
  bootstrap(): Promise<PlatformBootstrapData>;
}

interface MenuListResponse {
  items: MenuDto[];
}

export function createPlatformApiClient(options: {
  baseUrl?: string;
  getAccessToken: () => string | undefined;
  onUnauthorized?: () => void;
}): PlatformApiClient {
  const http = createHttpClient({
    baseUrl: options.baseUrl ?? new URL('/api/platform/', window.location.origin).toString(),
    getAccessToken: () => options.getAccessToken() ?? '',
    onUnauthorized: options.onUnauthorized,
  });

  return {
    async login(input) {
      const result = await http.post<LoginResult, LoginInput>('auth/login', input);
      return {
        accessToken: result.accessToken,
        currentUser: result.user,
      };
    },
    async bootstrap() {
      const [currentUser, menuResponse] = await Promise.all([
        http.get<CurrentUserDto>('auth/me'),
        http.get<MenuListResponse>('menus/my'),
      ]);

      return {
        currentUser,
        menus: menuResponse.items,
      };
    },
  };
}
