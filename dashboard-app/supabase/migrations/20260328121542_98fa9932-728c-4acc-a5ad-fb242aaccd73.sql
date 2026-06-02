
-- Table for AI automated follow-up events
CREATE TABLE public.ai_followup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  card_id text,
  contact_name text,
  contact_phone text,
  
  -- Cadence tracking
  cadence_name text NOT NULL DEFAULT 'default',
  cadence_step integer NOT NULL DEFAULT 1,
  cadence_total_steps integer DEFAULT 7,
  
  -- Message details
  channel text NOT NULL DEFAULT 'whatsapp',
  message_preview text,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  responded_at timestamp with time zone,
  
  -- Metrics
  response_time_seconds integer,
  engagement_score numeric(3,1) DEFAULT 0,
  lead_advanced boolean DEFAULT false,
  
  -- AI metrics
  ai_confidence numeric(3,2),
  ai_model_used text,
  ai_tokens_used integer,
  
  -- Next action
  next_action_date timestamp with time zone,
  next_action_type text,
  
  -- Result
  result text,
  notes text,
  
  -- Metadata
  raw_payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ai_followup_client ON public.ai_followup_events(client_id);
CREATE INDEX idx_ai_followup_card ON public.ai_followup_events(card_id);
CREATE INDEX idx_ai_followup_sent ON public.ai_followup_events(sent_at DESC);
CREATE INDEX idx_ai_followup_status ON public.ai_followup_events(status);
CREATE INDEX idx_ai_followup_cadence ON public.ai_followup_events(cadence_name, cadence_step);

-- RLS
ALTER TABLE public.ai_followup_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ai_followup_events"
  ON public.ai_followup_events FOR SELECT
  TO public USING (true);

CREATE POLICY "Anyone can insert ai_followup_events"
  ON public.ai_followup_events FOR INSERT
  TO public WITH CHECK (true);

CREATE POLICY "Anyone can update ai_followup_events"
  ON public.ai_followup_events FOR UPDATE
  TO public USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_followup_events;
