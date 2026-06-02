ALTER TABLE public.notificativo_leads
ADD COLUMN IF NOT EXISTS evaluation_stage text NOT NULL DEFAULT 'novo';
