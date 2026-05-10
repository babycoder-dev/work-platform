CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS presence;
CREATE SCHEMA IF NOT EXISTS approval;
CREATE SCHEMA IF NOT EXISTS report;
CREATE SCHEMA IF NOT EXISTS notification;

CREATE TABLE IF NOT EXISTS platform.enterprises (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.departments (
  id UUID PRIMARY KEY,
  enterprise_id UUID NOT NULL REFERENCES platform.enterprises(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  parent_id UUID,
  manager_user_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enterprise_id, code)
);

CREATE TABLE IF NOT EXISTS platform.users (
  id UUID PRIMARY KEY,
  enterprise_id UUID NOT NULL REFERENCES platform.enterprises(id),
  employee_no TEXT NOT NULL,
  account TEXT NOT NULL,
  name TEXT NOT NULL,
  department_id UUID,
  title TEXT,
  mobile TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enterprise_id, employee_no),
  UNIQUE (enterprise_id, account)
);

CREATE TABLE IF NOT EXISTS platform.local_identities (
  user_id UUID PRIMARY KEY REFERENCES platform.users(id),
  password_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.roles (
  id UUID PRIMARY KEY,
  enterprise_id UUID NOT NULL REFERENCES platform.enterprises(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  data_scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enterprise_id, code)
);

CREATE TABLE IF NOT EXISTS platform.permissions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  module_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.role_permissions (
  role_id UUID NOT NULL REFERENCES platform.roles(id),
  permission_code TEXT NOT NULL REFERENCES platform.permissions(code),
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS platform.user_roles (
  user_id UUID NOT NULL REFERENCES platform.users(id),
  role_id UUID NOT NULL REFERENCES platform.roles(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS platform.audit_logs (
  id UUID PRIMARY KEY,
  enterprise_id UUID,
  actor_user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  trace_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.domain_events (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  payload JSONB NOT NULL,
  trace_id TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification.notifications (
  id UUID PRIMARY KEY,
  recipient_user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_module TEXT,
  source_id TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS presence.status_records (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  department_id UUID,
  status TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
