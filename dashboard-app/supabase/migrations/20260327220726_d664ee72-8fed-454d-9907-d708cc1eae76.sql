UPDATE public.clients
SET features = features::jsonb || '{"ao_vivo": true}'::jsonb;