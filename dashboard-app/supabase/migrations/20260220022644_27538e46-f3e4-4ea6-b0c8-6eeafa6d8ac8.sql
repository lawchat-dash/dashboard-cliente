
-- Table for mapping client-specific step_ids to standard funnel stages
CREATE TABLE public.client_step_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  step_title TEXT NOT NULL,
  funnel_stage TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, step_id)
);

ALTER TABLE public.client_step_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage step mappings"
  ON public.client_step_mappings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can read step mappings"
  ON public.client_step_mappings FOR SELECT
  USING (true);

-- Enable extensions for cron scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
