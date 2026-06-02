-- =============================================================================
-- Helena Sync — Schema completo para n8n workflows (Postgres / Supabase)
-- =============================================================================
--
-- Estrutura: 4 tabelas linkadas + ALTER em clients
--
--   clients          (existe — adiciona 3 colunas de controle de sync)
--      ↑ FK
--      ├── helena_panels    (NOVO — pipelines do CRM)
--      │       ↑ FK
--      │       └── helena_cards     (cards/leads — referenciam contacts via array)
--      │              ↑ FK
--      │              └── helena_sessions  (sessões de chat de cada contato)
--      │                     ↑ FK
--      └── helena_contacts  (NOVO — pessoas únicas no CRM)
--
-- Como rodar:
--   psql "$DATABASE_URL" -f helena_sync_schema.sql
--   OU cole no SQL Editor do Supabase Dashboard
--
-- Idempotente: pode rodar várias vezes sem quebrar nada (IF NOT EXISTS).
-- Pra recriar do zero, descomente os DROP no topo.
-- =============================================================================


-- (Opcional) Reset total — descomente se quiser apagar TUDO antes de recriar
-- DROP TABLE IF EXISTS helena_sessions CASCADE;
-- DROP TABLE IF EXISTS helena_cards    CASCADE;
-- DROP TABLE IF EXISTS helena_contacts CASCADE;
-- DROP TABLE IF EXISTS helena_panels   CASCADE;


-- =============================================================================
-- 1. CLIENTS — adiciona 3 colunas de controle do sync (não dropa nada existente)
-- =============================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS first_sync_done   boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_full_sync_at timestamptz;

COMMENT ON COLUMN clients.first_sync_done   IS 'TRUE depois que o full sync inicial completou. Workflow B (incremental) ignora clientes com FALSE.';
COMMENT ON COLUMN clients.last_synced_at    IS 'Timestamp do último sync incremental. Usado como UpdatedAt.After na próxima rodada.';
COMMENT ON COLUMN clients.last_full_sync_at IS 'Timestamp do último full sync (reconciliação). Usado pela Camada 3 do cron.';


-- =============================================================================
-- 2. HELENA_PANELS — pipelines do CRM (1 cliente → N panels)
-- =============================================================================

CREATE TABLE IF NOT EXISTS helena_panels (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  helena_panel_id     text         NOT NULL,    -- UUID do panel na Helena
  title               text,
  description         text,
  steps               jsonb,                    -- array: [{stepId, stepTitle, stepPhase}, ...]
  raw                 jsonb,                    -- payload bruto da Helena
  created_at_helena   timestamptz,
  updated_at_helena   timestamptz,
  synced_at           timestamptz  NOT NULL DEFAULT now(),
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (client_id, helena_panel_id)
);

CREATE INDEX IF NOT EXISTS idx_helena_panels_client    ON helena_panels (client_id);
CREATE INDEX IF NOT EXISTS idx_helena_panels_helena_id ON helena_panels (helena_panel_id);

COMMENT ON TABLE  helena_panels IS 'Pipelines/painéis do CRM Helena (cada cliente tem 1+ panels).';
COMMENT ON COLUMN helena_panels.helena_panel_id IS 'UUID original do panel na API Helena (não confundir com id local).';


-- =============================================================================
-- 3. HELENA_CONTACTS — pessoas únicas (1 contato pode aparecer em N cards)
-- =============================================================================

CREATE TABLE IF NOT EXISTS helena_contacts (
  id                       text         PRIMARY KEY,   -- UUID do contact na Helena
  client_id                uuid         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Identidade
  name                     text,
  name_whatsapp            text,
  name_instagram           text,
  name_messenger           text,

  -- Contatos
  phone_number             text,          -- formato cru: "+55|55996336278"
  phone_number_formatted   text,          -- formato humano: "(55) 99633-6278"
  email                    text,
  instagram                text,
  messenger_id             text,

  -- Anotações e categorização
  annotation               text,
  tag_ids                  text[]       DEFAULT ARRAY[]::text[],
  tag_names                text[]       DEFAULT ARRAY[]::text[],
  status                   text,          -- ACTIVE, INACTIVE
  origin                   text,          -- CREATED_FROM_HUB, IMPORTED, etc.

  -- UTM achatado (do utm{} da Helena)
  utm_source               text,
  utm_medium               text,
  utm_campaign             text,
  utm_headline             text,
  utm_referral_url         text,
  utm_clid                 text,
  utm_source_id            text,

  -- Outros
  imported_at              timestamptz,
  custom_fields            jsonb,
  portfolio_ids            text[]       DEFAULT ARRAY[]::text[],
  portfolio_names          text[]       DEFAULT ARRAY[]::text[],

  -- Metadados
  raw                      jsonb,
  created_at_helena        timestamptz,
  updated_at_helena        timestamptz,
  synced_at                timestamptz  NOT NULL DEFAULT now(),
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_helena_contacts_client       ON helena_contacts (client_id);
CREATE INDEX IF NOT EXISTS idx_helena_contacts_phone        ON helena_contacts (phone_number_formatted);
CREATE INDEX IF NOT EXISTS idx_helena_contacts_updated      ON helena_contacts (updated_at_helena DESC);
CREATE INDEX IF NOT EXISTS idx_helena_contacts_utm_source   ON helena_contacts (utm_source);
CREATE INDEX IF NOT EXISTS idx_helena_contacts_tags         ON helena_contacts USING gin (tag_names);

COMMENT ON TABLE helena_contacts IS 'Pessoas no CRM Helena. Origem: GET /core/v1/contact/{id}. Cada contato pode estar em N cards.';


-- =============================================================================
-- 4. HELENA_CARDS — leads/oportunidades dentro dos panels
-- =============================================================================

CREATE TABLE IF NOT EXISTS helena_cards (
  id                       text         PRIMARY KEY,   -- UUID do card na Helena
  client_id                uuid         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  panel_id                 uuid         REFERENCES helena_panels(id) ON DELETE SET NULL,
  helena_panel_id          text,          -- redundante mas útil pra joins diretos

  -- Identificação
  title                    text,
  description              text,
  key                      text,          -- ex: "CSC-171"
  number                   int,

  -- Etapa / funil
  step_id                  text,
  step_title               text,
  step_phase               text,          -- INITIAL, INTERMEDIATE, FINAL
  funnel_stage             text,          -- classificação derivada: SDR/CLOSER/CONTRATO/ASSINADO/DESQUALIFICADO

  -- Flags úteis pra dashboard
  is_closed_contract       boolean      DEFAULT false,
  is_disqualified          boolean      DEFAULT false,
  is_stale                 boolean      DEFAULT false,    -- sem update >7d

  -- Valor e responsável
  monetary_amount          numeric,
  responsible_user_id      text,
  responsible_user_name    text,

  -- Relacionamentos
  contact_ids              text[]       DEFAULT ARRAY[]::text[],
  contact_names            text[]       DEFAULT ARRAY[]::text[],   -- snapshot dos nomes
  tag_ids                  text[]       DEFAULT ARRAY[]::text[],

  -- Custom fields achatado
  custom_fields            jsonb,
  utm_source               text,          -- extraído de customFields['conversa-iniciada-'][0] se houver

  -- Contrato fechado (parsed da nota)
  contract_note            jsonb,
  contract_parsed          jsonb,         -- {caso, resumo_caso, qualidade, potencial_retorno}

  -- Status
  archived                 boolean      DEFAULT false,
  sessions_synced          boolean      DEFAULT false,

  -- Metadados
  raw                      jsonb,
  created_at_helena        timestamptz,
  updated_at_helena        timestamptz,
  synced_at                timestamptz  NOT NULL DEFAULT now(),
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now()
);

-- Indexes pro fluxo do workflow + dashboard
CREATE INDEX IF NOT EXISTS idx_helena_cards_client          ON helena_cards (client_id);
CREATE INDEX IF NOT EXISTS idx_helena_cards_panel           ON helena_cards (panel_id);
CREATE INDEX IF NOT EXISTS idx_helena_cards_funnel          ON helena_cards (client_id, funnel_stage);
CREATE INDEX IF NOT EXISTS idx_helena_cards_updated         ON helena_cards (client_id, updated_at_helena DESC);
CREATE INDEX IF NOT EXISTS idx_helena_cards_step            ON helena_cards (step_id);
CREATE INDEX IF NOT EXISTS idx_helena_cards_responsible     ON helena_cards (responsible_user_id);
CREATE INDEX IF NOT EXISTS idx_helena_cards_archived        ON helena_cards (archived) WHERE archived = false;
CREATE INDEX IF NOT EXISTS idx_helena_cards_closed          ON helena_cards (client_id) WHERE is_closed_contract = true;
CREATE INDEX IF NOT EXISTS idx_helena_cards_sessions_pend   ON helena_cards (client_id, sessions_synced) WHERE sessions_synced = false;
CREATE INDEX IF NOT EXISTS idx_helena_cards_contacts        ON helena_cards USING gin (contact_ids);

COMMENT ON TABLE helena_cards IS 'Cards/leads dentro dos panels. Origem: GET /crm/v1/panel/card?PanelId=...';
COMMENT ON COLUMN helena_cards.funnel_stage IS 'Classificação derivada do step_title via lógica do n8n (SDR/CLOSER/CONTRATO/ASSINADO/DESQUALIFICADO).';
COMMENT ON COLUMN helena_cards.sessions_synced IS 'FALSE = workflow ainda precisa buscar sessions deste card. Workflow incremental sempre marca FALSE quando o card é alterado.';


-- =============================================================================
-- 5. HELENA_SESSIONS — conversas de chat (1 contato → N sessions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS helena_sessions (
  id                       text         PRIMARY KEY,   -- UUID da session na Helena
  client_id                uuid         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id               text         REFERENCES helena_contacts(id) ON DELETE SET NULL,
  card_id                  text         REFERENCES helena_cards(id) ON DELETE SET NULL,

  -- Identificação
  number                   text,          -- ex: "2025123000011"
  status                   text,          -- COMPLETED, ACTIVE, etc.
  status_description       text,
  type                     text,          -- INDIVIDUAL, GROUP

  -- Canal
  channel_id               text,
  channel_type             text,          -- ZAPI_WHATSAPP, etc.
  channel_name             text,          -- displayName
  channel_phone            text,          -- humanId (telefone da empresa)
  channel_provider         text,          -- Z-API, etc.

  -- Atendimento
  agent_id                 text,
  agent_name               text,
  department_id            text,
  department_name          text,
  classification           text,

  -- Métricas
  time_service             text,          -- ex: "2788:27:49"
  window_status            text,          -- ACTIVE, EXPIRED
  unread_count             int          DEFAULT 0,

  -- Mensagens
  last_message_text        text,
  last_interaction_at      timestamptz,
  last_message_in_at       timestamptz,
  last_message_out_at      timestamptz,
  first_response_at        timestamptz,

  -- Links
  preview_url              text,          -- URL original da Helena (com redirect?type=SESSION&id=)
  chat_url                 text,          -- formato chat2/sessions/{id} (derivado)

  -- UTM achatado
  utm_source               text,
  utm_medium               text,
  utm_campaign             text,
  utm_headline             text,
  utm_referral_url         text,
  utm_clid                 text,
  utm_source_id            text,
  utm_content              text,
  utm_term                 text,

  -- Timestamps da Helena
  started_at               timestamptz,
  ended_at                 timestamptz,
  created_at_helena        timestamptz,
  updated_at_helena        timestamptz,

  -- Metadados
  raw                      jsonb,         -- session detail v2 completo
  synced_at                timestamptz  NOT NULL DEFAULT now(),
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_helena_sessions_client       ON helena_sessions (client_id);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_contact      ON helena_sessions (contact_id);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_card         ON helena_sessions (card_id);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_status       ON helena_sessions (client_id, status);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_agent        ON helena_sessions (agent_id);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_department   ON helena_sessions (department_id);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_channel      ON helena_sessions (channel_id);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_last_interact ON helena_sessions (client_id, last_interaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_utm_source   ON helena_sessions (utm_source);
CREATE INDEX IF NOT EXISTS idx_helena_sessions_updated      ON helena_sessions (updated_at_helena DESC);

COMMENT ON TABLE helena_sessions IS 'Sessões de chat. Origem: GET /chat/v1/session + GET /chat/v2/session/{id}.';
COMMENT ON COLUMN helena_sessions.chat_url IS 'URL no formato https://{dominio}/chat2/sessions/{id} — derivada do preview_url da Helena.';


-- =============================================================================
-- 6. TRIGGERS — updated_at automático (sistema, não confundir com updated_at_helena)
-- =============================================================================

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_helena_panels_touch   ON helena_panels;
DROP TRIGGER IF EXISTS trg_helena_contacts_touch ON helena_contacts;
DROP TRIGGER IF EXISTS trg_helena_cards_touch    ON helena_cards;
DROP TRIGGER IF EXISTS trg_helena_sessions_touch ON helena_sessions;

CREATE TRIGGER trg_helena_panels_touch   BEFORE UPDATE ON helena_panels   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_helena_contacts_touch BEFORE UPDATE ON helena_contacts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_helena_cards_touch    BEFORE UPDATE ON helena_cards    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_helena_sessions_touch BEFORE UPDATE ON helena_sessions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- =============================================================================
-- 7. RPC HELPER — janela de sync com overlap defensivo
-- =============================================================================
-- Retorna o timestamp pra usar como UpdatedAt.After:
--   last_synced_at MENOS buffer_minutes (default 5min) pra cobrir edge cases.
--   NULL se o cliente nunca sincronizou (1ª vez).

CREATE OR REPLACE FUNCTION helena_get_sync_window(
  p_client_id     uuid,
  p_buffer_mins   int DEFAULT 5
)
RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT
    CASE
      WHEN c.first_sync_done = false THEN NULL
      WHEN c.last_synced_at  IS NULL THEN NULL
      ELSE c.last_synced_at - make_interval(mins => p_buffer_mins)
    END
  FROM clients c
  WHERE c.id = p_client_id;
$$;

COMMENT ON FUNCTION helena_get_sync_window IS 'Retorna timestamptz pra usar em UpdatedAt.After (já com overlap de 5min). NULL = full sync (1ª vez).';


-- =============================================================================
-- 8. RPC HELPER — marca sync completo
-- =============================================================================

CREATE OR REPLACE FUNCTION helena_mark_sync_complete(
  p_client_id   uuid,
  p_full_sync   boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE clients
     SET last_synced_at    = now(),
         first_sync_done   = true,
         last_full_sync_at = CASE WHEN p_full_sync THEN now() ELSE last_full_sync_at END
   WHERE id = p_client_id;
END;
$$;

COMMENT ON FUNCTION helena_mark_sync_complete IS 'Chamar ao fim de cada workflow. p_full_sync=true marca também last_full_sync_at.';


-- =============================================================================
-- 9. VIEW — resumo pronto pra dashboard (panels + contagens)
-- =============================================================================

CREATE OR REPLACE VIEW v_helena_client_summary AS
SELECT
  c.id                                              AS client_id,
  c.name                                            AS client_name,
  c.first_sync_done,
  c.last_synced_at,
  c.last_full_sync_at,
  (SELECT count(*) FROM helena_panels   p WHERE p.client_id = c.id)                            AS panels_count,
  (SELECT count(*) FROM helena_cards    k WHERE k.client_id = c.id AND k.archived = false)     AS cards_count,
  (SELECT count(*) FROM helena_cards    k WHERE k.client_id = c.id AND k.is_closed_contract)   AS contracts_closed,
  (SELECT count(*) FROM helena_cards    k WHERE k.client_id = c.id AND k.is_disqualified)      AS disqualified,
  (SELECT count(*) FROM helena_contacts t WHERE t.client_id = c.id)                            AS contacts_count,
  (SELECT count(*) FROM helena_sessions s WHERE s.client_id = c.id)                            AS sessions_count,
  (SELECT max(updated_at_helena) FROM helena_cards k WHERE k.client_id = c.id)                 AS last_card_update
FROM clients c
WHERE c.active = true;

COMMENT ON VIEW v_helena_client_summary IS 'Resumo agregado por cliente. Útil pra tela admin / status de sync.';


-- =============================================================================
-- 10. VERIFICAÇÃO — queries pra rodar manualmente depois da migration
-- =============================================================================
-- Ver tabelas criadas:
--   \dt helena_*
--
-- Ver as 3 colunas novas em clients:
--   \d clients
--
-- Resumo por cliente:
--   SELECT * FROM v_helena_client_summary;
--
-- Sync window pra um cliente:
--   SELECT helena_get_sync_window('a1b2c3d4-0002-0002-0002-000000000002', 5);
--
-- Cards do Sousa & Costa (depois de popular):
--   SELECT id, title, step_title, funnel_stage, updated_at_helena
--     FROM helena_cards
--    WHERE client_id = 'a1b2c3d4-0002-0002-0002-000000000002'
--    ORDER BY updated_at_helena DESC
--    LIMIT 20;
--
-- =============================================================================
