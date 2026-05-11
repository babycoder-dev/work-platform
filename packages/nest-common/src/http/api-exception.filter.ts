import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { createErrorResponse } from './error-response';
import type { TraceRequest } from './trace-id';

interface JsonResponse {
  status(code: number): JsonResponse;
  json(body: unknown): void;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<TraceRequest>();
    const response = http.getResponse<JsonResponse>();
    const normalized = createErrorResponse(exception, request.traceId);

    response.status(normalized.status).json(normalized.body);
  }
}
