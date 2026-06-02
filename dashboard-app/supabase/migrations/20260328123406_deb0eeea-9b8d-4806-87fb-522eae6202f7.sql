ALTER TABLE public.ai_followup_events
  ADD COLUMN IF NOT EXISTS department text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS template_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS template_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS template_error text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lead_closed_contract boolean DEFAULT false;