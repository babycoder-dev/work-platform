import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  auditLogs,
  departments,
  domainEvents,
  employees,
  enterprises,
  localIdentities,
  moduleManifests,
  permissions,
  rolePermissions,
  roles,
  sessions,
  userRoles,
} from './platform.schema';

describe('platform schema', () => {
  it('defines the platform core tables', () => {
    expect(getTableName(enterprises)).toBe('enterprises');
    expect(getTableName(departments)).toBe('departments');
    expect(getTableName(employees)).toBe('employees');
    expect(getTableName(localIdentities)).toBe('local_identities');
    expect(getTableName(permissions)).toBe('permissions');
    expect(getTableName(roles)).toBe('roles');
    expect(getTableName(rolePermissions)).toBe('role_permissions');
    expect(getTableName(userRoles)).toBe('user_roles');
    expect(getTableName(sessions)).toBe('sessions');
    expect(getTableName(moduleManifests)).toBe('module_manifests');
    expect(getTableName(auditLogs)).toBe('audit_logs');
    expect(getTableName(domainEvents)).toBe('domain_events');
  });
});
