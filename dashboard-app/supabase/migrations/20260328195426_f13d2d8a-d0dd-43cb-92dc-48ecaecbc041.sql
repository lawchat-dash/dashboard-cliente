
CREATE TABLE public.followup_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  periodo_dias integer NOT NULL DEFAULT 7,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX followup_snapshots_client_period_idx ON public.followup_snapshots (client_id, periodo_dias);

ALTER TABLE public.followup_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on followup_snapshots" ON public.followup_snapshots
  FOR SELECT USING (true);

CREATE POLICY "Allow service insert/update on followup_snapshots" ON public.followup_snapshots
  FOR ALL USING (true) WITH CHECK (true);
