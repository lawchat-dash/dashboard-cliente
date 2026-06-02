
CREATE TABLE public.notification_action_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  actor_name TEXT NOT NULL DEFAULT 'Sistema',
  actor_helena_user_id TEXT,
  action_type TEXT NOT NULL,
  lead_ids TEXT[] NOT NULL DEFAULT '{}',
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read notification_action_logs"
  ON public.notification_action_logs FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert notification_action_logs"
  ON public.notification_action_logs FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_notification_action_logs_client ON public.notification_action_logs(client_id);
CREATE INDEX idx_notification_action_logs_created ON public.notification_action_logs(created_at DESC);
