import type { CreateAuditLogInput } from './rbac';

export interface PlatformAuditPort {
  record(input: CreateAuditLogInput): Promise<void>;
}

export const PLATFORM_AUDIT_SERVICE = Symbol.for('PLATFORM_AUDIT_SERVICE');
