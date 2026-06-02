
CREATE TABLE public.notificativo_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id integer UNIQUE,
  client_id uuid REFERENCES public.clients(id),
  company_id text,
  user_number text,
  user_name text,
  id_chat text,
  id_linkconversa text,
  agente text,
  id_cardcrm text,
  idcontato text,
  id_campanha_link text,
  horario_notificacao timestamp with time zone,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notificativo_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read notificativo_leads"
  ON public.notificativo_leads FOR SELECT
  USING (true);

CREATE POLICY "Service can manage notificativo_leads"
  ON public.notificativo_leads FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_notificativo_leads_client ON public.notificativo_leads(client_id);
CREATE INDEX idx_notificativo_leads_company ON public.notificativo_leads(company_id);
CREATE INDEX idx_notificativo_leads_external ON public.notificativo_leads(external_id);
