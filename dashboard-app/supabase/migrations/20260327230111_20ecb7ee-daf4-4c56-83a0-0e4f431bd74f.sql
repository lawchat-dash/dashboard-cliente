-- Make client_id nullable and drop the FK so zapi_config can hold a single global row
ALTER TABLE public.zapi_config ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.zapi_config DROP CONSTRAINT IF EXISTS zapi_config_client_id_fkey;