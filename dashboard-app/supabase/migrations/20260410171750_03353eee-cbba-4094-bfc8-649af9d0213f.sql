
-- Add pipeline_stage and assigned_to columns
ALTER TABLE public.notificativo_leads
  ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'lead_qualificado',
  ADD COLUMN IF NOT EXISTS assigned_to text;

-- Allow public users to update notificativo_leads (for moving cards in kanban)
CREATE POLICY "Anyone can update notificativo_leads"
  ON public.notificativo_leads
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
