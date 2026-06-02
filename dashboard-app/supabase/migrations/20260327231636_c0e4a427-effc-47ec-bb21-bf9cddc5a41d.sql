ALTER TABLE public.clients ADD COLUMN helena_company_id TEXT;
CREATE UNIQUE INDEX idx_clients_helena_company_id ON public.clients (helena_company_id) WHERE helena_company_id IS NOT NULL;