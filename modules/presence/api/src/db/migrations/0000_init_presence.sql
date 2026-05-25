CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS presence;

CREATE TABLE IF NOT EXISTS presence.status_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL,
  user_id uuid NOT NULL,
  employee_no varchar(64) NOT NULL,
  user_name varchar(128) NOT NULL,
  department_id uuid NOT NULL,
  department_name varchar(128) NOT NULL,
  status varchar(32) NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  remark text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CONSTRAINT status_records_status_check CHECK (status IN ('working', 'business_trip', 'field_research', 'out', 'leave')),
  CONSTRAINT status_records_time_range_check CHECK (end_at IS NULL OR start_at < end_at)
);

CREATE INDEX IF NOT EXISTS status_records_user_start_idx ON presence.status_records (enterprise_id, user_id, start_at);
CREATE INDEX IF NOT EXISTS status_records_department_start_idx ON presence.status_records (enterprise_id, department_id, start_at);
CREATE INDEX IF NOT EXISTS status_records_status_start_idx ON presence.status_records (enterprise_id, status, start_at);
