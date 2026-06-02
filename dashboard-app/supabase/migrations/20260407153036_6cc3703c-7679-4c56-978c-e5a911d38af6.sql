-- Table to track API requests per client API key (sliding window rate limiting)
CREATE TABLE public.api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_hash text NOT NULL UNIQUE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  request_count integer NOT NULL DEFAULT 0,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  last_request_at timestamp with time zone NOT NULL DEFAULT now(),
  locked_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage api_rate_limits" ON public.api_rate_limits
  FOR ALL TO public
  USING (true) WITH CHECK (true);

-- Function to check and increment rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_api_key_hash text,
  p_client_id uuid,
  p_increment integer DEFAULT 1,
  p_max_requests integer DEFAULT 900,
  p_window_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_record api_rate_limits%ROWTYPE;
  v_now timestamp with time zone := now();
  v_window_start timestamp with time zone;
  v_remaining integer;
BEGIN
  SELECT * INTO v_record FROM api_rate_limits WHERE api_key_hash = p_api_key_hash;
  
  IF v_record IS NULL THEN
    INSERT INTO api_rate_limits (api_key_hash, client_id, request_count, window_start, last_request_at)
    VALUES (p_api_key_hash, p_client_id, p_increment, v_now, v_now)
    RETURNING * INTO v_record;
    RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - p_increment, 'request_count', p_increment);
  END IF;
  
  IF v_record.locked_until IS NOT NULL AND v_record.locked_until > v_now THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'request_count', v_record.request_count, 'locked_until', v_record.locked_until, 'wait_seconds', extract(epoch from (v_record.locked_until - v_now)));
  END IF;
  
  v_window_start := v_now - (p_window_seconds || ' seconds')::interval;
  
  IF v_record.window_start < v_window_start THEN
    UPDATE api_rate_limits SET request_count = p_increment, window_start = v_now, last_request_at = v_now, locked_until = NULL WHERE api_key_hash = p_api_key_hash;
    RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - p_increment, 'request_count', p_increment);
  END IF;
  
  v_remaining := p_max_requests - v_record.request_count - p_increment;
  
  IF v_remaining < 0 THEN
    UPDATE api_rate_limits SET locked_until = v_record.window_start + (p_window_seconds || ' seconds')::interval, last_request_at = v_now WHERE api_key_hash = p_api_key_hash;
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'request_count', v_record.request_count, 'wait_seconds', extract(epoch from ((v_record.window_start + (p_window_seconds || ' seconds')::interval) - v_now)));
  END IF;
  
  UPDATE api_rate_limits SET request_count = request_count + p_increment, last_request_at = v_now WHERE api_key_hash = p_api_key_hash;
  RETURN jsonb_build_object('allowed', true, 'remaining', v_remaining, 'request_count', v_record.request_count + p_increment);
END;
$$;

-- Function to lock an API key after receiving 429
CREATE OR REPLACE FUNCTION public.lock_rate_limit(
  p_api_key_hash text,
  p_lock_seconds integer DEFAULT 300
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO api_rate_limits (api_key_hash, request_count, window_start, last_request_at, locked_until)
  VALUES (p_api_key_hash, 999, now(), now(), now() + (p_lock_seconds || ' seconds')::interval)
  ON CONFLICT (api_key_hash) DO UPDATE SET locked_until = now() + (p_lock_seconds || ' seconds')::interval;
END;
$$;