ALTER TABLE platform.roles DROP CONSTRAINT IF EXISTS roles_data_scope_check;
ALTER TABLE platform.roles DROP COLUMN IF EXISTS data_scope;
ALTER TABLE platform.roles ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS platform.role_data_scopes (
  role_id uuid NOT NULL REFERENCES platform.roles(id) ON DELETE CASCADE,
  data_type varchar(32) NOT NULL,
  scope varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_data_scopes_pk PRIMARY KEY (role_id, data_type),
  CONSTRAINT role_data_scopes_type_check CHECK (data_type IN ('profile', 'presence', 'report')),
  CONSTRAINT role_data_scopes_scope_check CHECK (scope IN ('self', 'department', 'department_tree', 'company', 'custom'))
);
