
CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  card_id text,
  card_title text,
  contact_name text,
  contact_phone text,
  responsible text,
  scheduled_date timestamp with time zone NOT NULL,
  completed_date timestamp with time zone,
  status text NOT NULL DEFAULT 'pending',
  contact_type text NOT NULL DEFAULT 'whatsapp',
  result text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read follow_ups" ON public.follow_ups FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert follow_ups" ON public.follow_ups FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update follow_ups" ON public.follow_ups FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete follow_ups" ON public.follow_ups FOR DELETE TO public USING (true);

CREATE INDEX idx_follow_ups_client_id ON public.follow_ups(client_id);
CREATE INDEX idx_follow_ups_card_id ON public.follow_ups(card_id);
CREATE INDEX idx_follow_ups_scheduled_date ON public.follow_ups(scheduled_date);
CREATE INDEX idx_follow_ups_status ON public.follow_ups(status);
