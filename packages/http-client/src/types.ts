export interface HttpClientOptions {
  baseUrl: string;
  getAccessToken: () => string | Promise<string>;
  getTenantId?: () => string | undefined;
  onUnauthorized?: () => void;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
}

export interface SseStreamHandle {
  close(): void;
}

export interface SseStreamOptions {
  onMessage: (data: unknown) => void;
  onError?: (error: unknown) => void;
  onOpen?: () => void;
  signal?: AbortSignal;
}

export interface HttpClient {
  get<TResponse>(url: string, options?: HttpRequestOptions): Promise<TResponse>;
  post<TResponse, TBody = unknown>(
    url: string,
    body?: TBody,
    options?: HttpRequestOptions,
  ): Promise<TResponse>;
  patch<TResponse, TBody = unknown>(
    url: string,
    body?: TBody,
    options?: HttpRequestOptions,
  ): Promise<TResponse>;
  put<TResponse, TBody = unknown>(
    url: string,
    body?: TBody,
    options?: HttpRequestOptions,
  ): Promise<TResponse>;
  delete<TResponse>(url: string, options?: HttpRequestOptions): Promise<TResponse>;
  stream(url: string, options: SseStreamOptions): SseStreamHandle;
}
