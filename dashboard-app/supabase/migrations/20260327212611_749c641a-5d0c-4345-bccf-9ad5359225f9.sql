
CREATE TABLE public.live_messages (
  id TEXT PRIMARY KEY,
  client_id UUID NOT NULL,
  company_id TEXT,
  session_id TEXT NOT NULL,
  text TEXT NOT NULL,
  direction TEXT NOT NULL,
  origin TEXT NOT NULL,
  status TEXT,
  sender_from TEXT,
  sender_to TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read live_messages" ON public.live_messages
  FOR SELECT TO public USING (true);

CREATE INDEX idx_live_messages_client_id ON public.live_messages (client_id);
CREATE INDEX idx_live_messages_session_id ON public.live_messages (session_id);
CREATE INDEX idx_live_messages_created_at ON public.live_messages (created_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
