ALTER TABLE public.ai_followup_events
  ADD COLUMN IF NOT EXISTS tipo_followup text,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS agente text;