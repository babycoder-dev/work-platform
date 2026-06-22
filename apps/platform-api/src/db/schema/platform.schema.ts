import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  check,
  boolean,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const platformSchema = pgSchema('platform');

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const enterprises = platformSchema.table('enterprises', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  ...timestamps,
}, (table) => ({
  codeUnique: uniqueIndex('enterprises_code_unique').on(table.code),
}));

export const departments = platformSchema.table('departments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: uuid('enterprise_id').notNull().references(() => enterprises.id),
  parentId: uuid('parent_id').references((): AnyPgColumn => departments.id),
  managerUserId: uuid('manager_user_id').references((): AnyPgColumn => employees.id),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  enterpriseCodeUnique: uniqueIndex('departments_enterprise_code_unique').on(table.enterpriseId, table.code),
  enterpriseIdx: index('departments_enterprise_idx').on(table.enterpriseId),
  parentIdx: index('departments_parent_idx').on(table.parentId),
}));

export const employees = platformSchema.table('employees', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: uuid('enterprise_id').notNull().references(() => enterprises.id),
  departmentId: uuid('department_id').references(() => departments.id),
  employeeNo: varchar('employee_no', { length: 64 }).notNull(),
  account: varchar('account', { length: 128 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  title: varchar('title', { length: 128 }),
  mobile: varchar('mobile', { length: 64 }),
  email: varchar('email', { length: 256 }),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  registrationStatus: varchar('registration_status', { length: 32 }).notNull().default('active'),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  enterpriseAccountUnique: uniqueIndex('employees_enterprise_account_unique').on(table.enterpriseId, table.account),
  enterpriseEmployeeNoUnique: uniqueIndex('employees_enterprise_employee_no_unique').on(
    table.enterpriseId,
    table.employeeNo,
  ),
  departmentIdx: index('employees_department_idx').on(table.departmentId),
  enterpriseIdx: index('employees_enterprise_idx').on(table.enterpriseId),
  registrationStatusCheck: check(
    'employees_registration_status_check',
    sql`${table.registrationStatus} IN ('active', 'pending')`,
  ),
}));

export const localIdentities = platformSchema.table('local_identities', {
  userId: uuid('user_id').primaryKey().references(() => employees.id),
  account: varchar('account', { length: 128 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true }).defaultNow().notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  accountUnique: uniqueIndex('local_identities_account_unique').on(table.account),
}));

export const permissions = platformSchema.table('permissions', {
  code: varchar('code', { length: 128 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  moduleName: varchar('module_name', { length: 64 }).notNull(),
  description: text('description'),
  ...timestamps,
});

export const roles = platformSchema.table('roles', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: uuid('enterprise_id').notNull().references(() => enterprises.id),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  enterpriseCodeUnique: uniqueIndex('roles_enterprise_code_unique').on(table.enterpriseId, table.code),
  enterpriseIdx: index('roles_enterprise_idx').on(table.enterpriseId),
}));

export const rolePermissions = platformSchema.table('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id),
  permissionCode: varchar('permission_code', { length: 128 }).notNull().references(() => permissions.code),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.roleId, table.permissionCode], name: 'role_permissions_pk' }),
}));

export const roleDataScopes = platformSchema.table('role_data_scopes', {
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  dataType: varchar('data_type', { length: 32 }).notNull(),
  scope: varchar('scope', { length: 32 }).notNull(),
  ...timestamps,
}, (table) => ({
  pk: primaryKey({ columns: [table.roleId, table.dataType], name: 'role_data_scopes_pk' }),
  typeCheck: check(
    'role_data_scopes_type_check',
    sql`${table.dataType} IN ('profile', 'presence', 'report')`,
  ),
  scopeCheck: check(
    'role_data_scopes_scope_check',
    sql`${table.scope} IN ('self', 'department', 'department_tree', 'company', 'custom')`,
  ),
}));

export const userRoles = platformSchema.table('user_roles', {
  userId: uuid('user_id').notNull().references(() => employees.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.roleId], name: 'user_roles_pk' }),
}));

export const sessions = platformSchema.table('sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => employees.id),
  accessTokenHash: text('access_token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdIp: varchar('created_ip', { length: 128 }),
  userAgent: text('user_agent'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  accessTokenHashUnique: uniqueIndex('sessions_access_token_hash_unique').on(table.accessTokenHash),
  userIdx: index('sessions_user_idx').on(table.userId),
}));

export const moduleManifests = platformSchema.table('module_manifests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  moduleName: varchar('module_name', { length: 64 }).notNull(),
  manifest: jsonb('manifest').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  ...timestamps,
}, (table) => ({
  moduleNameUnique: uniqueIndex('module_manifests_module_name_unique').on(table.moduleName),
}));

export const menus = platformSchema.table('menus', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  moduleName: varchar('module_name', { length: 64 }).notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => menus.id),
  title: varchar('title', { length: 128 }).notNull(),
  path: varchar('path', { length: 256 }).notNull(),
  permissionCode: varchar('permission_code', { length: 128 }).references(() => permissions.code),
  sortOrder: integer('sort_order').notNull().default(0),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  ...timestamps,
}, (table) => ({
  moduleIdx: index('menus_module_idx').on(table.moduleName),
  parentIdx: index('menus_parent_idx').on(table.parentId),
}));

export const auditLogs = platformSchema.table('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: uuid('actor_user_id'),
  actorAccount: varchar('actor_account', { length: 128 }),
  action: varchar('action', { length: 128 }).notNull(),
  resourceType: varchar('resource_type', { length: 128 }).notNull(),
  resourceId: varchar('resource_id', { length: 128 }),
  traceId: varchar('trace_id', { length: 128 }),
  ip: varchar('ip', { length: 128 }),
  userAgent: text('user_agent'),
  result: varchar('result', { length: 32 }).notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  actionIdx: index('audit_logs_action_idx').on(table.action),
  actorIdx: index('audit_logs_actor_idx').on(table.actorUserId),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));

export const statusLogs = platformSchema.table('status_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  enterpriseId: uuid('enterprise_id').notNull().references(() => enterprises.id),
  subjectEmployeeId: uuid('subject_employee_id').notNull().references(() => employees.id),
  authorEmployeeId: uuid('author_employee_id').notNull().references(() => employees.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  subjectIdx: index('status_logs_subject_idx').on(table.enterpriseId, table.subjectEmployeeId, table.createdAt),
}));

export const domainEvents = platformSchema.table('domain_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  eventName: varchar('event_name', { length: 128 }).notNull(),
  aggregateType: varchar('aggregate_type', { length: 128 }).notNull(),
  aggregateId: varchar('aggregate_id', { length: 128 }).notNull(),
  payload: jsonb('payload').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, (table) => ({
  aggregateIdx: index('domain_events_aggregate_idx').on(table.aggregateType, table.aggregateId),
  eventNameIdx: index('domain_events_event_name_idx').on(table.eventName),
  unpublishedIdx: index('domain_events_unpublished_idx').on(table.publishedAt),
}));

export const enterpriseRelations = relations(enterprises, ({ many }) => ({
  departments: many(departments),
  employees: many(employees),
  roles: many(roles),
}));

export const employeeRelations = relations(employees, ({ many, one }) => ({
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
  }),
  localIdentity: one(localIdentities),
  userRoles: many(userRoles),
}));
