ALTER TABLE platform.employees
  ADD COLUMN IF NOT EXISTS registration_status varchar(32) NOT NULL DEFAULT 'active';

ALTER TABLE platform.employees
  DROP CONSTRAINT IF EXISTS employees_registration_status_check;

ALTER TABLE platform.employees
  ADD CONSTRAINT employees_registration_status_check
  CHECK (registration_status IN ('active', 'pending'));
