-- ============================================================
-- Migração de alinhamento com o schema do Lovable
-- Adiciona colunas faltantes + cria tabelas faltantes + indexes + RLS
-- Idempotente (pode rodar várias vezes sem quebrar)
-- ============================================================

-- ============================================================
-- 1. ALTERAÇÕES EM TABELAS EXISTENTES
-- ============================================================

-- helena_cards: adicionar colunas que faltam
ALTER TABLE public.helena_cards
  ADD COLUMN IF NOT EXISTS panel_title text,
  ADD COLUMN IF NOT EXISTS due_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS is_overdue boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS responsible_user jsonb,
  ADD COLUMN IF NOT EXISTS contacts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS "position" double precision,
  ADD COLUMN IF NOT EXISTS company_id text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS tags_name jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS sessions_synced boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS contract_note jsonb,
  ADD COLUMN IF NOT EXISTS contract_parsed jsonb;

-- helena_sessions: adicionar colunas que faltam
ALTER TABLE public.helena_sessions
  ADD COLUMN IF NOT EXISTS session_created_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS session_closed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS session_detail_full jsonb,
  ADD COLUMN IF NOT EXISTS client_name text;

-- ============================================================
-- 2. CRIAR TABELAS FALTANTES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_followup_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid,
    card_id text,
    contact_name text,
    contact_phone text,
    cadence_name text DEFAULT 'default' NOT NULL,
    cadence_step integer DEFAULT 1 NOT NULL,
    cadence_total_steps integer DEFAULT 7,
    channel text DEFAULT 'whatsapp' NOT NULL,
    message_preview text,
    status text DEFAULT 'sent' NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    responded_at timestamp with time zone,
    response_time_seconds integer,
    engagement_score numeric(3,1) DEFAULT 0,
    lead_advanced boolean DEFAULT false,
    ai_confidence numeric(3,2),
    ai_model_used text,
    ai_tokens_used integer,
    next_action_date timestamp with time zone,
    next_action_type text,
    result text,
    notes text,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    department text,
    template_name text,
    template_status text,
    template_error text,
    lead_closed_contract boolean DEFAULT false,
    user_number text,
    message_id text,
    template_content text,
    tipo_followup text,
    categoria text,
    agente text
);

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    api_key_hash text NOT NULL UNIQUE,
    client_id uuid,
    request_count integer DEFAULT 0 NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    last_request_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.crm_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('notification','message','note','agent')),
    client_id uuid,
    parent_id uuid REFERENCES public.crm_items(id) ON DELETE CASCADE,
    name text,
    phone text,
    email text,
    avatar_url text,
    content text,
    status text,
    source text,
    role text,
    sender text,
    assigned_to uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid,
    card_id text,
    card_title text,
    contact_name text,
    contact_phone text,
    responsible text,
    scheduled_date timestamp with time zone NOT NULL,
    completed_date timestamp with time zone,
    status text DEFAULT 'pending' NOT NULL,
    contact_type text DEFAULT 'whatsapp' NOT NULL,
    result text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.followup_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    client_id uuid NOT NULL,
    periodo_dias integer DEFAULT 7 NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    gerado_em timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE,
    email text,
    display_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sync_progress (
    id text DEFAULT 'sync-sessions' NOT NULL PRIMARY KEY,
    last_offset integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_helena_cards_client_id    ON public.helena_cards (client_id);
CREATE INDEX IF NOT EXISTS idx_helena_cards_client_name  ON public.helena_cards (client_name);
CREATE INDEX IF NOT EXISTS idx_helena_cards_created_at   ON public.helena_cards (created_at);
CREATE INDEX IF NOT EXISTS idx_helena_cards_step_title   ON public.helena_cards (step_title);
CREATE INDEX IF NOT EXISTS idx_helena_cards_synced_at    ON public.helena_cards (synced_at);
CREATE INDEX IF NOT EXISTS idx_helena_cards_sessions_synced ON public.helena_cards (sessions_synced) WHERE sessions_synced = false;

CREATE INDEX IF NOT EXISTS idx_helena_sessions_card_id      ON public.helena_sessions (card_id);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_client_id    ON public.helena_sessions (client_id);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_client_name  ON public.helena_sessions (client_name);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_contact_id   ON public.helena_sessions (contact_id);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_utm_campaign ON public.helena_sessions (utm_campaign);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_utm_source   ON public.helena_sessions (utm_source);

CREATE INDEX IF NOT EXISTS idx_live_messages_client_id   ON public.live_messages (client_id);
CREATE INDEX IF NOT EXISTS idx_live_messages_created_at  ON public.live_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_live_messages_session_id  ON public.live_messages (session_id);

CREATE INDEX IF NOT EXISTS idx_ai_followup_card     ON public.ai_followup_events (card_id);
CREATE INDEX IF NOT EXISTS idx_ai_followup_client   ON public.ai_followup_events (client_id);
CREATE INDEX IF NOT EXISTS idx_ai_followup_sent     ON public.ai_followup_events (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_followup_status   ON public.ai_followup_events (status);

CREATE INDEX IF NOT EXISTS idx_crm_items_client ON public.crm_items (client_id);
CREATE INDEX IF NOT EXISTS idx_crm_items_kind   ON public.crm_items (kind);
CREATE INDEX IF NOT EXISTS idx_crm_items_parent ON public.crm_items (parent_id);

CREATE INDEX IF NOT EXISTS idx_follow_ups_card_id        ON public.follow_ups (card_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_client_id      ON public.follow_ups (client_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled_date ON public.follow_ups (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status         ON public.follow_ups (status);

CREATE UNIQUE INDEX IF NOT EXISTS followup_snapshots_client_period_idx ON public.followup_snapshots (client_id, periodo_dias);

-- ============================================================
-- 4. RLS POLICIES (replicar do Lovable: leitura pública pra muitas)
-- ============================================================

ALTER TABLE public.ai_followup_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_progress         ENABLE ROW LEVEL SECURITY;

-- Leitura aberta (como Lovable)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read ai_followup_events" ON public.ai_followup_events;
  CREATE POLICY "Anyone can read ai_followup_events" ON public.ai_followup_events FOR SELECT USING (true);

  DROP POLICY IF EXISTS "Anyone can insert ai_followup_events" ON public.ai_followup_events;
  CREATE POLICY "Anyone can insert ai_followup_events" ON public.ai_followup_events FOR INSERT WITH CHECK (true);

  DROP POLICY IF EXISTS "Anyone can update ai_followup_events" ON public.ai_followup_events;
  CREATE POLICY "Anyone can update ai_followup_events" ON public.ai_followup_events FOR UPDATE USING (true);

  DROP POLICY IF EXISTS "Anyone can read crm_items" ON public.crm_items;
  CREATE POLICY "Anyone can read crm_items" ON public.crm_items FOR SELECT USING (true);

  DROP POLICY IF EXISTS "Anyone can insert crm_items" ON public.crm_items;
  CREATE POLICY "Anyone can insert crm_items" ON public.crm_items FOR INSERT WITH CHECK (true);

  DROP POLICY IF EXISTS "Anyone can update crm_items" ON public.crm_items;
  CREATE POLICY "Anyone can update crm_items" ON public.crm_items FOR UPDATE USING (true);

  DROP POLICY IF EXISTS "Anyone can delete crm_items" ON public.crm_items;
  CREATE POLICY "Anyone can delete crm_items" ON public.crm_items FOR DELETE USING (true);

  DROP POLICY IF EXISTS "Anyone can read follow_ups" ON public.follow_ups;
  CREATE POLICY "Anyone can read follow_ups" ON public.follow_ups FOR SELECT USING (true);

  DROP POLICY IF EXISTS "Anyone can insert follow_ups" ON public.follow_ups;
  CREATE POLICY "Anyone can insert follow_ups" ON public.follow_ups FOR INSERT WITH CHECK (true);

  DROP POLICY IF EXISTS "Anyone can update follow_ups" ON public.follow_ups;
  CREATE POLICY "Anyone can update follow_ups" ON public.follow_ups FOR UPDATE USING (true);

  DROP POLICY IF EXISTS "Anyone can delete follow_ups" ON public.follow_ups;
  CREATE POLICY "Anyone can delete follow_ups" ON public.follow_ups FOR DELETE USING (true);

  DROP POLICY IF EXISTS "Allow public read on followup_snapshots" ON public.followup_snapshots;
  CREATE POLICY "Allow public read on followup_snapshots" ON public.followup_snapshots FOR SELECT USING (true);

  DROP POLICY IF EXISTS "Allow service insert/update on followup_snapshots" ON public.followup_snapshots;
  CREATE POLICY "Allow service insert/update on followup_snapshots" ON public.followup_snapshots USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "Anyone can read sync_progress" ON public.sync_progress;
  CREATE POLICY "Anyone can read sync_progress" ON public.sync_progress FOR SELECT USING (true);

  DROP POLICY IF EXISTS "Service can manage api_rate_limits" ON public.api_rate_limits;
  CREATE POLICY "Service can manage api_rate_limits" ON public.api_rate_limits USING (true) WITH CHECK (true);
END $$;

-- ============================================================
-- 5. Atualizar client_name nas tabelas existentes (denormalização)
-- ============================================================
UPDATE public.helena_cards c
   SET client_name = h.name
  FROM public.helena_clientes_crm h
 WHERE c.client_id = h.id AND c.client_name IS NULL;

UPDATE public.helena_sessions s
   SET client_name = h.name
  FROM public.helena_clientes_crm h
 WHERE s.client_id = h.id AND s.client_name IS NULL;

-- ============================================================
-- Confirma
-- ============================================================
SELECT 'OK — migração aplicada' AS status;
