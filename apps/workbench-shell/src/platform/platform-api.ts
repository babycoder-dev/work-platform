import { createHttpClient } from '@work/http-client';
import type {
  ChangePasswordInput,
  CurrentUserDto,
  EmployeeDto,
  LoginInput,
  LoginResult,
  MenuDto,
  PasswordPolicyDto,
  UpdateMyProfileInput,
} from '@work/platform-contract';

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
  changePassword(input: ChangePasswordInput): Promise<void>;
  getPasswordPolicy(): Promise<PasswordPolicyDto>;
  getMyProfile(): Promise<EmployeeDto>;
  updateMyProfile(input: UpdateMyProfileInput): Promise<EmployeeDto>;
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
    async changePassword(input) {
      await http.post<{ success: true }, ChangePasswordInput>('auth/change-password', input);
    },
    getPasswordPolicy() {
      return http.get<PasswordPolicyDto>('auth/password-policy');
    },
    getMyProfile() {
      return http.get<EmployeeDto>('employees/me');
    },
    updateMyProfile(input) {
      return http.put<EmployeeDto, UpdateMyProfileInput>('employees/me/profile', input);
    },
  };
}
