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
}
