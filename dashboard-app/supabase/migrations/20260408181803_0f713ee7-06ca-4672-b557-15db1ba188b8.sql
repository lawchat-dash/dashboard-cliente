
-- Remove duplicates keeping the most recent one
DELETE FROM public.ai_followup_events a
USING public.ai_followup_events b
WHERE a.card_id IS NOT NULL
  AND a.card_id = b.card_id
  AND a.cadence_name = b.cadence_name
  AND a.cadence_step = b.cadence_step
  AND a.created_at < b.created_at;

-- Now create the unique partial index
CREATE UNIQUE INDEX idx_ai_followup_events_upsert_key
ON public.ai_followup_events (card_id, cadence_name, cadence_step)
WHERE card_id IS NOT NULL;
