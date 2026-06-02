
-- Create a function to manage per-client cron jobs
CREATE OR REPLACE FUNCTION public.manage_client_cron(
  p_action TEXT,
  p_client_slug TEXT,
  p_client_id UUID DEFAULT NULL,
  p_interval_minutes INT DEFAULT 10
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'extensions'
AS $$
DECLARE
  v_cron_name TEXT;
  v_schedule TEXT;
  v_supabase_url TEXT;
  v_anon_key TEXT;
BEGIN
  v_cron_name := 'sync-client-' || p_client_slug;
  
  IF p_action = 'delete' THEN
    PERFORM cron.unschedule(v_cron_name);
    RETURN 'deleted: ' || v_cron_name;
  END IF;
  
  IF p_action = 'create' THEN
    -- Try to remove existing first
    BEGIN
      PERFORM cron.unschedule(v_cron_name);
    EXCEPTION WHEN OTHERS THEN
      -- ignore if not exists
    END;
    
    v_schedule := '*/' || p_interval_minutes || ' * * * *';
    
    -- Get config from vault/env
    SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1;
    
    -- Fallback to hardcoded if vault not available
    IF v_supabase_url IS NULL THEN
      v_supabase_url := current_setting('app.settings.supabase_url', true);
    END IF;
    
    PERFORM cron.schedule(
      v_cron_name,
      v_schedule,
      format(
        'SELECT net.http_post(url:=%L, headers:=%L::jsonb, body:=%L::jsonb) as request_id',
        v_supabase_url || '/functions/v1/sync-all-clients',
        json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon_key)::text,
        json_build_object('clientId', p_client_id::text)::text
      )
    );
    
    RETURN 'created: ' || v_cron_name || ' every ' || p_interval_minutes || ' min';
  END IF;
  
  RETURN 'unknown action: ' || p_action;
END;
$$;
