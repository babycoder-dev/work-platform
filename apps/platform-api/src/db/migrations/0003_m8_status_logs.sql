CREATE TABLE IF NOT EXISTS platform.status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL REFERENCES platform.enterprises(id),
  subject_employee_id uuid NOT NULL REFERENCES platform.employees(id),
  author_employee_id uuid NOT NULL REFERENCES platform.employees(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS status_logs_subject_idx
  ON platform.status_logs (enterprise_id, subject_employee_id, created_at DESC, id DESC);
