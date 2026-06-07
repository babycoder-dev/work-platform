CREATE SCHEMA IF NOT EXISTS notification;

CREATE TABLE IF NOT EXISTS notification.notification (
  id uuid PRIMARY KEY,
  recipient_user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  source_module text,
  source_id text,
  channel text NOT NULL DEFAULT 'in_app',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_channel_check CHECK (channel IN ('in_app', 'im', 'email', 'sms'))
);

CREATE INDEX IF NOT EXISTS notification_recipient_read_idx
  ON notification.notification (recipient_user_id, read_at);

CREATE INDEX IF NOT EXISTS notification_recipient_created_idx
  ON notification.notification (recipient_user_id, created_at DESC);
