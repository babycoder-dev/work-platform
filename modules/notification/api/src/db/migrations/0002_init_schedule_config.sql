CREATE TABLE IF NOT EXISTS notification.schedule_config (
  job_key text PRIMARY KEY,
  cron text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 占位心跳 job：本期唯一启用的 job，证明调度框架可用
INSERT INTO notification.schedule_config (job_key, cron, enabled, params)
VALUES ('notification.heartbeat', '0 * * * *', true, '{}'::jsonb)
ON CONFLICT (job_key) DO NOTHING;

-- 预留(M10) ①②：默认 disabled，仅占接线点；M10 接上日报数据后启用
INSERT INTO notification.schedule_config (job_key, cron, enabled, params)
VALUES
  ('report.reminder.due', '0 9 * * *', false, '{}'::jsonb),
  ('report.reminder.completed', '0 9 * * *', false, '{}'::jsonb)
ON CONFLICT (job_key) DO NOTHING;
