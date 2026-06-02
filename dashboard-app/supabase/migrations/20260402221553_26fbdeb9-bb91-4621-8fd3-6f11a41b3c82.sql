SELECT cron.unschedule('cleanup-live-messages');

SELECT cron.schedule(
  'cleanup-live-messages',
  '*/30 * * * *',
  $$DELETE FROM public.live_messages WHERE created_at < NOW() - INTERVAL '24 hours'$$
);