CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS forms;

CREATE TABLE IF NOT EXISTS forms.form_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL,
  slot_key varchar(128) NOT NULL,
  owner_module varchar(64) NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  status varchar(32) NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_definitions_revision_check CHECK (revision >= 1),
  CONSTRAINT form_definitions_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT form_definitions_enterprise_slot_unique UNIQUE (enterprise_id, slot_key),
  CONSTRAINT form_definitions_enterprise_id_unique UNIQUE (enterprise_id, id)
);

CREATE TABLE IF NOT EXISTS forms.form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL,
  definition_id uuid NOT NULL,
  field_key varchar(64) NOT NULL,
  label varchar(128) NOT NULL,
  field_type varchar(32) NOT NULL,
  required boolean NOT NULL,
  description varchar(512),
  sort_order integer NOT NULL,
  options jsonb,
  status varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_fields_type_check CHECK (
    field_type IN ('text', 'textarea', 'number', 'date', 'single_select', 'multi_select', 'file', 'image', 'employee')
  ),
  CONSTRAINT form_fields_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT form_fields_definition_key_unique UNIQUE (definition_id, field_key),
  CONSTRAINT form_fields_definition_fk FOREIGN KEY (enterprise_id, definition_id)
    REFERENCES forms.form_definitions (enterprise_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS forms.form_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL,
  definition_id uuid NOT NULL,
  slot_key varchar(128) NOT NULL,
  definition_revision integer NOT NULL,
  subject_type varchar(64) NOT NULL,
  subject_id varchar(128) NOT NULL,
  submitted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_records_definition_revision_check CHECK (definition_revision >= 1),
  CONSTRAINT form_records_enterprise_id_unique UNIQUE (enterprise_id, id),
  CONSTRAINT form_records_definition_fk FOREIGN KEY (enterprise_id, definition_id)
    REFERENCES forms.form_definitions (enterprise_id, id)
);

CREATE TABLE IF NOT EXISTS forms.form_record_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL,
  record_id uuid NOT NULL,
  field_key varchar(64) NOT NULL,
  field_label_snapshot varchar(128) NOT NULL,
  field_type_snapshot varchar(32) NOT NULL,
  value jsonb NOT NULL,
  display_snapshot jsonb,
  sort_order_snapshot integer NOT NULL,
  CONSTRAINT form_record_values_type_check CHECK (
    field_type_snapshot IN ('text', 'textarea', 'number', 'date', 'single_select', 'multi_select', 'file', 'image', 'employee')
  ),
  CONSTRAINT form_record_values_record_key_unique UNIQUE (record_id, field_key),
  CONSTRAINT form_record_values_record_fk FOREIGN KEY (enterprise_id, record_id)
    REFERENCES forms.form_records (enterprise_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS form_fields_definition_sort_idx ON forms.form_fields (enterprise_id, definition_id, sort_order);
CREATE INDEX IF NOT EXISTS form_records_subject_idx ON forms.form_records (enterprise_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS form_record_values_record_idx ON forms.form_record_values (enterprise_id, record_id);
