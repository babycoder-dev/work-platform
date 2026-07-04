CREATE TABLE IF NOT EXISTS presence.status_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL,
  key varchar(64) NOT NULL,
  label varchar(64) NOT NULL,
  is_preset boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  status varchar(16) NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_types_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT status_types_key_unique UNIQUE (enterprise_id, key)
);

CREATE UNIQUE INDEX IF NOT EXISTS status_types_default_unique_idx
  ON presence.status_types (enterprise_id)
  WHERE is_default AND status = 'active';

ALTER TABLE presence.status_records DROP CONSTRAINT IF EXISTS status_records_status_check;
ALTER TABLE presence.status_records ALTER COLUMN status TYPE varchar(64);
ALTER TABLE presence.status_records ADD COLUMN IF NOT EXISTS form_record_id uuid;
