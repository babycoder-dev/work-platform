import { ApiError } from '@work/errors';
import type { HttpClient, HttpClientOptions, HttpRequestOptions } from './types';

export function createHttpClient(options: HttpClientOptions): HttpClient {
  async function request<TResponse>(
    method: string,
    url: string,
    body?: unknown,
    requestOptions?: HttpRequestOptions,
  ): Promise<TResponse> {
    const token = await options.getAccessToken();
    const traceId = crypto.randomUUID();
    const target = new URL(url, options.baseUrl);

    for (const [key, value] of Object.entries(requestOptions?.query ?? {})) {
      if (value !== undefined) {
        target.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Trace-Id': traceId,
      ...requestOptions?.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const tenantId = options.getTenantId?.();
    if (tenantId) {
      headers['X-Tenant-Id'] = tenantId;
    }

    const response = await fetch(target, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await readJson(response);

    if (response.status === 401) {
      options.onUnauthorized?.();
    }

    if (!response.ok) {
      throw ApiError.fromResponse(payload, {
        status: response.status,
        traceId,
      });
    }

    return payload as TResponse;
  }

  return {
    get: (url, requestOptions) => request('GET', url, undefined, requestOptions),
    post: (url, body, requestOptions) => request('POST', url, body, requestOptions),
    put: (url, body, requestOptions) => request('PUT', url, body, requestOptions),
    delete: (url, requestOptions) => request('DELETE', url, undefined, requestOptions),
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
