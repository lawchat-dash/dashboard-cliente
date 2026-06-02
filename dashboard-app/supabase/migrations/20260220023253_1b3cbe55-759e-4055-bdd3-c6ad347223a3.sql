
-- Add feature toggles to clients table
ALTER TABLE public.clients 
ADD COLUMN features JSONB NOT NULL DEFAULT '{"dashboard": true, "pipeline": true, "campanhas": true, "auditoria": true}'::jsonb;
