CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  content_id text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  error text
);

CREATE INDEX idx_webhook_events_event_type ON public.webhook_events(event_type);
CREATE INDEX idx_webhook_events_received_at ON public.webhook_events(received_at DESC);
CREATE INDEX idx_webhook_events_processed ON public.webhook_events(processed);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read webhook_events" ON public.webhook_events FOR SELECT USING (true);