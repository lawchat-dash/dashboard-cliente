CREATE OR REPLACE FUNCTION public.manage_client_cron(p_action text, p_client_slug text, p_client_id uuid DEFAULT NULL::uuid, p_interval_minutes integer DEFAULT 60)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'extensions'
AS $function$
DECLARE
  v_cron_name TEXT;
  v_schedule TEXT;
  v_offset INTEGER;
  v_supabase_url TEXT := 'https://nrntxdcvrflgufdskdam.supabase.co';
  v_anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybnR4ZGN2cmZsZ3VmZHNrZGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MjQzNTQsImV4cCI6MjA4NjUwMDM1NH0.jf_5yFY3UrVzCIKG7GuhwuJA_iQVNpx63vXeNi0jImw';
BEGIN
  v_cron_name := 'sync-client-' || p_client_slug;
  
  IF p_action = 'delete' THEN
    PERFORM cron.unschedule(v_cron_name);
    RETURN 'deleted: ' || v_cron_name;
  END IF;
  
  IF p_action = 'create' THEN
    BEGIN
      PERFORM cron.unschedule(v_cron_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    
    -- Calculate a unique offset based on slug hash to distribute clients across the hour
    -- This ensures clients don't all fire at minute 0
    v_offset := abs(hashtext(p_client_slug)) % 60;
    
    -- For hourly intervals (60 min), use specific minute offset
    -- For shorter intervals, use modular schedule with offset
    IF p_interval_minutes >= 60 THEN
      v_schedule := v_offset || ' * * * *'; -- e.g., "23 * * * *" = runs at minute 23 every hour
    ELSE
      v_schedule := v_offset || ' */' || (p_interval_minutes / 60 + 1) || ' * * *';
      -- Fallback: for intervals < 60, just use the interval with offset
      v_schedule := '*/' || p_interval_minutes || ' * * * *';
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
    
    RETURN 'created: ' || v_cron_name || ' at minute ' || v_offset || ' every hour';
  END IF;
  
  RETURN 'unknown action: ' || p_action;
END;
$function$;