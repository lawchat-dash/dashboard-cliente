
-- Add report frequency, report mode columns to notification_settings
ALTER TABLE public.notification_settings
  ADD COLUMN report_daily boolean NOT NULL DEFAULT true,
  ADD COLUMN report_weekly boolean NOT NULL DEFAULT false,
  ADD COLUMN report_monthly boolean NOT NULL DEFAULT false,
  ADD COLUMN report_mode text NOT NULL DEFAULT 'all';
-- report_mode: 'all' = tudo, 'new_only' = só leads novos, 'updates_only' = só movimentações
