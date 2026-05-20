const ACCESS_TOKEN_KEY = 'work-platform.access-token';

export function readAccessToken(): string | undefined {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? undefined;
}

export function saveAccessToken(accessToken: string): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

export function clearAccessToken(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}
