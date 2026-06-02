
CREATE TABLE public.helena_agents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  helena_user_id text NOT NULL,
  name text NOT NULL,
  email text,
  profile text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  raw_data jsonb,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_id, helena_user_id)
);

ALTER TABLE public.helena_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read helena_agents" ON public.helena_agents FOR SELECT TO public USING (true);
CREATE POLICY "Service can manage helena_agents" ON public.helena_agents FOR ALL TO service_role USING (true) WITH CHECK (true);
