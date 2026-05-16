CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.enterprises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(64) NOT NULL,
  name varchar(128) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enterprises_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS enterprises_code_unique ON platform.enterprises (code);

CREATE TABLE IF NOT EXISTS platform.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES platform.enterprises(id),
  parent_id uuid REFERENCES platform.departments(id),
  manager_user_id uuid,
  code varchar(64) NOT NULL,
  name varchar(128) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departments_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS departments_enterprise_code_unique ON platform.departments (enterprise_id, code);
CREATE INDEX IF NOT EXISTS departments_enterprise_idx ON platform.departments (enterprise_id);
CREATE INDEX IF NOT EXISTS departments_parent_idx ON platform.departments (parent_id);

CREATE TABLE IF NOT EXISTS platform.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES platform.enterprises(id),
  department_id uuid REFERENCES platform.departments(id),
  employee_no varchar(64) NOT NULL,
  account varchar(128) NOT NULL,
  name varchar(128) NOT NULL,
  title varchar(128),
  mobile varchar(64),
  email varchar(256),
  status varchar(32) NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_status_check CHECK (status IN ('active', 'disabled', 'left'))
);

ALTER TABLE platform.departments
  ADD CONSTRAINT departments_manager_user_fk
  FOREIGN KEY (manager_user_id) REFERENCES platform.employees(id);

CREATE UNIQUE INDEX IF NOT EXISTS employees_enterprise_account_unique ON platform.employees (enterprise_id, account);
CREATE UNIQUE INDEX IF NOT EXISTS employees_enterprise_employee_no_unique ON platform.employees (enterprise_id, employee_no);
CREATE INDEX IF NOT EXISTS employees_department_idx ON platform.employees (department_id);
CREATE INDEX IF NOT EXISTS employees_enterprise_idx ON platform.employees (enterprise_id);

CREATE TABLE IF NOT EXISTS platform.local_identities (
  user_id uuid PRIMARY KEY REFERENCES platform.employees(id),
  account varchar(128) NOT NULL,
  password_hash text NOT NULL,
  password_updated_at timestamptz NOT NULL DEFAULT now(),
  must_change_password boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS local_identities_account_unique ON platform.local_identities (account);

CREATE TABLE IF NOT EXISTS platform.permissions (
  code varchar(128) PRIMARY KEY,
  name varchar(128) NOT NULL,
  module_name varchar(64) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES platform.enterprises(id),
  code varchar(64) NOT NULL,
  name varchar(128) NOT NULL,
  description text,
  data_scope varchar(32) NOT NULL DEFAULT 'self',
  status varchar(32) NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_data_scope_check CHECK (data_scope IN ('self', 'department', 'department_tree', 'company', 'custom')),
  CONSTRAINT roles_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS roles_enterprise_code_unique ON platform.roles (enterprise_id, code);
CREATE INDEX IF NOT EXISTS roles_enterprise_idx ON platform.roles (enterprise_id);

CREATE TABLE IF NOT EXISTS platform.role_permissions (
  role_id uuid NOT NULL REFERENCES platform.roles(id) ON DELETE CASCADE,
  permission_code varchar(128) NOT NULL REFERENCES platform.permissions(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_permissions_pk PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS platform.user_roles (
  user_id uuid NOT NULL REFERENCES platform.employees(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES platform.roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_pk PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS platform.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES platform.employees(id) ON DELETE CASCADE,
  access_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_ip varchar(128),
  user_agent text,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_access_token_hash_unique ON platform.sessions (access_token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON platform.sessions (user_id);

CREATE TABLE IF NOT EXISTS platform.module_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name varchar(64) NOT NULL,
  manifest jsonb NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_manifests_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS module_manifests_module_name_unique ON platform.module_manifests (module_name);

CREATE TABLE IF NOT EXISTS platform.menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name varchar(64) NOT NULL,
  parent_id uuid REFERENCES platform.menus(id),
  title varchar(128) NOT NULL,
  path varchar(256) NOT NULL,
  permission_code varchar(128) REFERENCES platform.permissions(code),
  sort_order integer NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menus_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE INDEX IF NOT EXISTS menus_module_idx ON platform.menus (module_name);
CREATE INDEX IF NOT EXISTS menus_parent_idx ON platform.menus (parent_id);

CREATE TABLE IF NOT EXISTS platform.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_account varchar(128),
  action varchar(128) NOT NULL,
  resource_type varchar(128) NOT NULL,
  resource_id varchar(128),
  trace_id varchar(128),
  ip varchar(128),
  user_agent text,
  result varchar(32) NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON platform.audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON platform.audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON platform.audit_logs (created_at);

CREATE TABLE IF NOT EXISTS platform.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name varchar(128) NOT NULL,
  aggregate_type varchar(128) NOT NULL,
  aggregate_id varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS domain_events_aggregate_idx ON platform.domain_events (aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS domain_events_event_name_idx ON platform.domain_events (event_name);
CREATE INDEX IF NOT EXISTS domain_events_unpublished_idx ON platform.domain_events (published_at);
