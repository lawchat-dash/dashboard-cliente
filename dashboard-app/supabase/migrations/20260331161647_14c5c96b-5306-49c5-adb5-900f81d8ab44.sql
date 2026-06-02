ALTER TABLE public.ai_followup_events
  ADD COLUMN IF NOT EXISTS user_number text,
  ADD COLUMN IF NOT EXISTS message_id text,
  ADD COLUMN IF NOT EXISTS template_content text;