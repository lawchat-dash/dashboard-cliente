
-- Create helena_sessions table
CREATE TABLE public.helena_sessions (
  id text NOT NULL PRIMARY KEY,
  card_id text,
  contact_id text,
  status text,
  session_created_at timestamptz,
  session_closed_at timestamptz,
  agent_name text,
  department_name text,
  channel_type text,
  channel_name text,
  classification text,
  contact_name text,
  contact_phone text,
  contact_email text,
  utm_source text,
  utm_source_id text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_headline text,
  utm_term text,
  utm_referral_url text,
  utm_clid text,
  session_detail_full jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- Index for card_id lookups
CREATE INDEX idx_helena_sessions_card_id ON public.helena_sessions(card_id);
CREATE INDEX idx_helena_sessions_contact_id ON public.helena_sessions(contact_id);
CREATE INDEX idx_helena_sessions_utm_source ON public.helena_sessions(utm_source);
CREATE INDEX idx_helena_sessions_utm_campaign ON public.helena_sessions(utm_campaign);

-- Enable RLS
ALTER TABLE public.helena_sessions ENABLE ROW LEVEL SECURITY;

-- Public read access (same as helena_cards)
CREATE POLICY "Anyone can read helena_sessions"
  ON public.helena_sessions
  FOR SELECT
  USING (true);

-- Create sync_progress table for batch tracking
CREATE TABLE public.sync_progress (
  id text NOT NULL PRIMARY KEY DEFAULT 'sync-sessions',
  last_offset integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sync_progress"
  ON public.sync_progress
  FOR SELECT
  USING (true);
