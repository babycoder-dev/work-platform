export interface CurrentUser {
  id: string;
  account: string;
  name: string;
  departmentId?: string;
  departmentName?: string;
  permissions: string[];
}

export interface ToastInput {
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  description?: string;
}

export interface BreadcrumbItem {
  title: string;
  path?: string;
}

export type EventHandler<TPayload> = (payload: TPayload) => void;

export interface PlatformSDK {
  getCurrentUser(): Promise<CurrentUser>;
  hasPermission(code: string): boolean;
  navigate(path: string): void;
  emit<TPayload>(eventName: string, payload: TPayload): void;
  on<TPayload>(eventName: string, handler: EventHandler<TPayload>): () => void;
  showToast(input: ToastInput): void;
  setBreadcrumb(items: BreadcrumbItem[]): void;
}
