
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS report_period text NOT NULL DEFAULT 'today';

CREATE OR REPLACE FUNCTION public.compute_client_metrics(p_client_id uuid, p_period text DEFAULT 'all'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_date_filter timestamp with time zone;
  v_total integer;
  v_sdr integer;
  v_closer integer;
  v_contrato integer;
  v_assinatura integer;
  v_assinado integer;
  v_desqual integer;
  v_nao_assinou integer;
  v_conv numeric(5,2);
BEGIN
  IF p_period = 'today' THEN
    v_date_filter := now() - interval '1 day';
  ELSIF p_period = '3d' THEN
    v_date_filter := now() - interval '3 days';
  ELSIF p_period = '7d' THEN
    v_date_filter := now() - interval '7 days';
  ELSIF p_period = '15d' THEN
    v_date_filter := now() - interval '15 days';
  ELSIF p_period = '30d' THEN
    v_date_filter := now() - interval '30 days';
  ELSE
    v_date_filter := '1970-01-01'::timestamp with time zone;
  END IF;

  WITH classified AS (
    SELECT 
      COALESCE(
        csm.funnel_stage,
        CASE 
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%SDR%' THEN 'SDR'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%ANALISE MANUAL%' THEN 'SDR'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%CONTRATO FECHADO%' THEN 'CONTRATO FECHADO'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%CONTRATO ASSINADO%' THEN 'CONTRATO FECHADO'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%NAO SEGUIU COM O CONTRATO%' THEN 'NAO ASSINOU'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%FIZEMOS CONTRATO NAO ASSINOU%' THEN 'NAO ASSINOU'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%NAO ASSINOU%' THEN 'NAO ASSINOU'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%ASSINATURA%' THEN 'ETAPA DE ASSINATURA'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%CONTRATO%' THEN 'CONTRATO'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%ELABORA%' THEN 'CONTRATO'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%CONFECCAO%' THEN 'CONTRATO'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%DESQUALIFICADO%' THEN 'DESQUALIFICADO'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%DESCARTADO%' THEN 'DESQUALIFICADO'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%NAO TEM INTERESSE%' THEN 'DESQUALIFICADO'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%CLOSER%' THEN 'CLOSER'
          WHEN UPPER(REGEXP_REPLACE(REGEXP_REPLACE(hc.step_title, '[^\w\sÀ-ÿ]', '', 'g'), '\s+', ' ', 'g')) LIKE '%COMERCIAL%' THEN 'CLOSER'
          ELSE 'OTHER'
        END
      ) as stage
    FROM helena_cards hc
    LEFT JOIN client_step_mappings csm ON csm.client_id = hc.client_id AND csm.step_id = hc.step_id
    WHERE hc.client_id = p_client_id
      AND hc.archived = false
      AND hc.created_at >= v_date_filter
  )
  SELECT 
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE stage = 'SDR')::integer,
    COUNT(*) FILTER (WHERE stage = 'CLOSER')::integer,
    COUNT(*) FILTER (WHERE stage = 'CONTRATO')::integer,
    COUNT(*) FILTER (WHERE stage = 'ETAPA DE ASSINATURA')::integer,
    COUNT(*) FILTER (WHERE stage = 'CONTRATO FECHADO')::integer,
    COUNT(*) FILTER (WHERE stage = 'DESQUALIFICADO')::integer,
    COUNT(*) FILTER (WHERE stage = 'NAO ASSINOU')::integer
  INTO v_total, v_sdr, v_closer, v_contrato, v_assinatura, v_assinado, v_desqual, v_nao_assinou
  FROM classified;

  v_conv := CASE WHEN v_total > 0 THEN ROUND((v_assinado::numeric / v_total) * 100, 2) ELSE 0 END;

  INSERT INTO client_metrics_cache (client_id, period, total_leads, sdr, closer, contrato, assinatura, assinado, desqualificado, nao_assinou, conversion_rate, updated_at)
  VALUES (p_client_id, p_period, v_total, v_sdr, v_closer, v_contrato, v_assinatura, v_assinado, v_desqual, v_nao_assinou, v_conv, now())
  ON CONFLICT (client_id, period) DO UPDATE SET
    total_leads = EXCLUDED.total_leads,
    sdr = EXCLUDED.sdr,
    closer = EXCLUDED.closer,
    contrato = EXCLUDED.contrato,
    assinatura = EXCLUDED.assinatura,
    assinado = EXCLUDED.assinado,
    desqualificado = EXCLUDED.desqualificado,
    nao_assinou = EXCLUDED.nao_assinou,
    conversion_rate = EXCLUDED.conversion_rate,
    updated_at = EXCLUDED.updated_at;
END;
$function$;
