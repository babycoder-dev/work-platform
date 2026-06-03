CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS files;

CREATE TABLE IF NOT EXISTS files.file_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL,
  provider varchar(32) NOT NULL,
  storage_key varchar(256) NOT NULL,
  original_name varchar(255) NOT NULL,
  media_type varchar(128) NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 varchar(64) NOT NULL,
  status varchar(32) NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  staged_expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  CONSTRAINT file_objects_size_check CHECK (size_bytes >= 0),
  CONSTRAINT file_objects_sha256_check CHECK (length(sha256) = 64),
  CONSTRAINT file_objects_status_check CHECK (status IN ('staged', 'attached', 'deleting', 'deleted')),
  CONSTRAINT file_objects_provider_storage_key_unique UNIQUE (provider, storage_key),
  CONSTRAINT file_objects_enterprise_id_unique UNIQUE (enterprise_id, id)
);

CREATE TABLE IF NOT EXISTS files.file_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_id uuid NOT NULL,
  file_id uuid NOT NULL,
  owner_module varchar(64) NOT NULL,
  reference_type varchar(64) NOT NULL,
  reference_id varchar(128) NOT NULL,
  attached_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT file_references_enterprise_file_unique UNIQUE (enterprise_id, file_id),
  CONSTRAINT file_references_reference_unique UNIQUE (
    enterprise_id,
    file_id,
    owner_module,
    reference_type,
    reference_id
  ),
  CONSTRAINT file_references_file_fk FOREIGN KEY (enterprise_id, file_id)
    REFERENCES files.file_objects (enterprise_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS file_objects_uploader_status_idx
  ON files.file_objects (enterprise_id, uploaded_by, status, created_at);
CREATE INDEX IF NOT EXISTS file_references_reference_idx
  ON files.file_references (enterprise_id, owner_module, reference_type, reference_id);
