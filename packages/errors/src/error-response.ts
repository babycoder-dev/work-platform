export interface ErrorResponse {
  success: false;
  code: string;
  message: string;
  traceId?: string;
  details?: unknown;
}
