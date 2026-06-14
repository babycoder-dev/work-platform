CREATE TABLE IF NOT EXISTS notification.trigger_config (
  trigger_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  default_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO notification.trigger_config (trigger_key, enabled, default_recipients)
VALUES (
  'presence.status.changed',
  true,
  '[{"kind":"department_manager"}]'::jsonb
)
ON CONFLICT (trigger_key) DO NOTHING;
