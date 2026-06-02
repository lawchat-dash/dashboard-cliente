
-- Create table to cache Helena CRM cards
CREATE TABLE public.helena_cards (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  panel_id TEXT,
  panel_title TEXT,
  step_id TEXT,
  step_title TEXT,
  step_phase TEXT,
  title TEXT,
  key TEXT,
  number INTEGER,
  due_date TIMESTAMPTZ,
  is_overdue BOOLEAN DEFAULT false,
  tag_ids JSONB DEFAULT '[]'::jsonb,
  monetary_amount NUMERIC,
  responsible_user JSONB,
  contact_ids JSONB DEFAULT '[]'::jsonb,
  contacts JSONB DEFAULT '[]'::jsonb,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  metadata JSONB,
  position INTEGER,
  description TEXT,
  company_id TEXT,
  responsible_user_id TEXT,
  session_id TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS needed - this is public read-only cache data
ALTER TABLE public.helena_cards ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access (dashboard is public)
CREATE POLICY "Anyone can read helena_cards"
  ON public.helena_cards
  FOR SELECT
  USING (true);

-- Only service role can write (edge function uses service role)
-- No insert/update/delete policies for anon role

-- Create index for common queries
CREATE INDEX idx_helena_cards_step_title ON public.helena_cards (step_title);
CREATE INDEX idx_helena_cards_created_at ON public.helena_cards (created_at);
CREATE INDEX idx_helena_cards_synced_at ON public.helena_cards (synced_at);

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
