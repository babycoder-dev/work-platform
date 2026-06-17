import { ApiError } from '@work/errors';
import type {
  HttpClient,
  HttpClientOptions,
  HttpRequestOptions,
  SseStreamHandle,
  SseStreamOptions,
} from './types';

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

  function stream(url: string, streamOptions: SseStreamOptions): SseStreamHandle {
    const controller = new AbortController();
    let closed = false;
    const abortFromExternalSignal = () => controller.abort();

    if (streamOptions.signal) {
      if (streamOptions.signal.aborted) {
        controller.abort();
      } else {
        streamOptions.signal.addEventListener('abort', abortFromExternalSignal, { once: true });
      }
    }

    void consumeSseStream(url, controller.signal, streamOptions, options).finally(removeExternalAbortListener);

    return {
      close() {
        closed = true;
        controller.abort();
        removeExternalAbortListener();
      },
    };

    function removeExternalAbortListener() {
      streamOptions.signal?.removeEventListener('abort', abortFromExternalSignal);
    }

    async function consumeSseStream(
      requestUrl: string,
      signal: AbortSignal,
      callbacks: SseStreamOptions,
      clientOptions: HttpClientOptions,
    ): Promise<void> {
      try {
        const token = await clientOptions.getAccessToken();
        if (closed || signal.aborted) {
          return;
        }

        const target = new URL(requestUrl, clientOptions.baseUrl);
        const traceId = crypto.randomUUID();
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
          'X-Trace-Id': traceId,
        };

        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const tenantId = clientOptions.getTenantId?.();
        if (tenantId) {
          headers['X-Tenant-Id'] = tenantId;
        }

        const response = await fetch(target, {
          method: 'GET',
          headers,
          signal,
        });

        if (response.status === 401) {
          clientOptions.onUnauthorized?.();
        }

        if (!response.ok) {
          callbacks.onError?.(new Error(`SSE request failed with status ${response.status}`));
          return;
        }

        callbacks.onOpen?.();

        if (!response.body) {
          callbacks.onError?.(new Error('SSE response has no body'));
          return;
        }

        await readSseBody(response.body, callbacks, signal);
      } catch (error) {
        if (!signal.aborted && !closed) {
          callbacks.onError?.(error);
        }
      }
    }
  }

  return {
    get: (url, requestOptions) => request('GET', url, undefined, requestOptions),
    post: (url, body, requestOptions) => request('POST', url, body, requestOptions),
    patch: (url, body, requestOptions) => request('PATCH', url, body, requestOptions),
    put: (url, body, requestOptions) => request('PUT', url, body, requestOptions),
    delete: (url, requestOptions) => request('DELETE', url, undefined, requestOptions),
    stream,
  };
}

async function readSseBody(body: ReadableStream<Uint8Array>, options: SseStreamOptions, signal: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal.aborted) {
      const result = await reader.read();
      if (result.done) {
        if (!signal.aborted) {
          options.onError?.(new Error('SSE stream closed'));
        }
        return;
      }
      buffer += decoder.decode(result.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const parsed = parseSseFrame(frame);
        if (parsed !== undefined && !signal.aborted) {
          options.onMessage(parsed);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseFrame(frame: string): unknown {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');

  if (!data) {
    return undefined;
  }

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
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
