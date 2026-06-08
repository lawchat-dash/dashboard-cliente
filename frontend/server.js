// Helena Sync Local v2 — server.js
// Faz tudo: GET da Helena + UPSERT no Postgres (Supabase)
// Roda: node server.js → http://localhost:8787

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT, 10) || 8787; // easypanel/produção injeta PORT
const HELENA = "https://api.helena.run";

// ============================================================
// .env loader (sem dependência)
// ============================================================
function loadEnv() {
  try {
    const text = fs.readFileSync(path.join(__dirname, ".env"), "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch (e) {
    console.warn("⚠ .env não encontrado — defina DB_HOST etc. via env vars");
  }
}
loadEnv();

// ============================================================
// Postgres pool
// ============================================================
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || "postgres",
  ssl: { rejectUnauthorized: false },
  max: 30,  // suporta vários clientes rodando em paralelo
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => console.error("PG pool error:", err.message));

// Migração automática (idempotente) na inicialização
async function ensureSchema() {
  try {
    await pool.query(`
      ALTER TABLE helena_clientes_crm
        ADD COLUMN IF NOT EXISTS panel_ids         text[]  DEFAULT ARRAY[]::text[],
        ADD COLUMN IF NOT EXISTS notes             text,
        ADD COLUMN IF NOT EXISTS nivel_atencao     int     DEFAULT 1,
        ADD COLUMN IF NOT EXISTS panels_config     jsonb   DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS numeros_dashboard text[]  DEFAULT ARRAY[]::text[],
        ADD COLUMN IF NOT EXISTS step_mappings     jsonb   DEFAULT '{}'::jsonb;
    `);
    // Lista todas as FKs em helena_sessions ANTES
    const before = await pool.query(`
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'helena_sessions'::regclass AND contype = 'f'`);
    console.log("FKs em helena_sessions ANTES:", before.rows.map((r) => r.conname));

    // Drop dinâmico — pega QUALQUER FK em contact_id ou card_id (independente do nome)
    await pool.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT conname FROM pg_constraint
           WHERE conrelid = 'helena_sessions'::regclass
             AND contype = 'f'
             AND (conname ILIKE '%contact%' OR conname ILIKE '%card%')
        LOOP
          EXECUTE format('ALTER TABLE helena_sessions DROP CONSTRAINT %I', r.conname);
        END LOOP;
      END $$;
    `);

    const after = await pool.query(`
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'helena_sessions'::regclass AND contype = 'f'`);
    console.log("FKs em helena_sessions DEPOIS:", after.rows.map((r) => r.conname));
    console.log("✓ Schema OK + FKs problemáticas removidas");
  } catch (e) {
    console.warn("⚠ ensureSchema falhou:", e.message);
    console.warn("  → primeiro roda: ALTER TABLE clients RENAME TO helena_clientes_crm;");
  }
}

// ============================================================
// SYNC LOG helpers
// ============================================================
async function startSyncLog(clientId, type) {
  try {
    const r = await pool.query(
      `INSERT INTO helena_sync_log (client_id, sync_type, status) VALUES ($1, $2, 'running') RETURNING id`,
      [clientId, type]
    );
    return r.rows[0].id;
  } catch (e) { console.warn("startSyncLog:", e.message); return null; }
}
async function endSyncLog(logId, result) {
  if (!logId) return;
  try {
    await pool.query(
      `UPDATE helena_sync_log SET
         finished_at = now(),
         duration_ms = (extract(epoch from (now() - started_at)) * 1000)::int,
         status = $2,
         cards_synced = $3, sessions_synced = $4, contacts_synced = $5,
         error_message = $6
       WHERE id = $1`,
      [logId, result.status, result.cards || 0, result.sessions || 0, result.contacts || 0, result.error || null]
    );
  } catch (e) { console.warn("endSyncLog:", e.message); }
}

// ============================================================
// LOCK por cliente (anti-colisão MODO 2 × MODO 3)
// ============================================================
async function acquireDbLock(clientId, type, ttlHours = 2) {
  const r = await pool.query(
    `UPDATE helena_clientes_crm
        SET sync_status = $2,
            sync_lock_until = now() + ($3 || ' hours')::interval
      WHERE id = $1
        AND (sync_status = 'idle' OR sync_lock_until IS NULL OR sync_lock_until < now())
      RETURNING id`,
    [clientId, type, String(ttlHours)]
  );
  return r.rows.length > 0;
}
async function releaseDbLock(clientId) {
  await pool.query(
    `UPDATE helena_clientes_crm SET sync_status = 'idle', sync_lock_until = NULL WHERE id = $1`,
    [clientId]
  );
}

// ============================================================
// LOCKOUT por cliente (smart rate limit)
// Se um cliente bate 429, marca como "lockado" por 5 min.
// Próximas tentativas de sync esperam ou pulam.
// ============================================================
const clientLockouts = new Map(); // clientId → unlockAt (timestamp ms)
function setClientLocked(clientId, durationMs = 5 * 60 * 1000) {
  clientLockouts.set(clientId, Date.now() + durationMs);
  console.log(`🔒 Cliente ${clientId.slice(0, 8)}… lockado por ${Math.round(durationMs / 1000)}s`);
}
function getClientLockRemaining(clientId) {
  const t = clientLockouts.get(clientId);
  if (!t) return 0;
  const rem = t - Date.now();
  if (rem <= 0) { clientLockouts.delete(clientId); return 0; }
  return rem;
}

// ============================================================
// Helena GET (retry com backoff)
// ============================================================
const THROTTLE_MS = 2000;
const MAX_ATTEMPTS = 8;            // 8 tentativas (antes era 5)
const REQUEST_TIMEOUT_MS = 30_000;
const LIMIT_WAIT_MS = 4 * 60_000;  // 4 min de espera quando bate 429 / network error
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let retryStats = { total: 0, network: 0, rate429: 0, http5xx: 0 };
function resetRetryStats() { retryStats = { total: 0, network: 0, rate429: 0, http5xx: 0 }; }

// ============================================================
// GLOBAL EVENT LOG (ring buffer, sempre ligado)
// ============================================================
let nextEventId = 1;
const serverEvents = []; // ring buffer dos últimos 500 eventos
const MAX_EVENTS = 500;

function pushEvent(type, data = {}) {
  serverEvents.push({
    id: nextEventId++,
    ts: Date.now(),
    type,
    ...data,
  });
  while (serverEvents.length > MAX_EVENTS) serverEvents.shift();
}

function getEventsSince(sinceId) {
  return serverEvents.filter((e) => e.id > sinceId);
}

// ============================================================
// Abort flag por cliente (pra pause/cancel)
// ============================================================
const activeSyncs = new Map(); // clientId → { abort: boolean, type: string }
function startSync(clientId, type) {
  const state = { abort: false, type, startedAt: Date.now() };
  activeSyncs.set(clientId, state);
  return state;
}
function endSync(clientId) { activeSyncs.delete(clientId); }
function abortSync(clientId) {
  const s = activeSyncs.get(clientId);
  if (s) { s.abort = true; return true; }
  return false;
}
function isAborted(state) { return !!state?.abort; }

async function fetchWithTimeout(url, options, ms = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function helenaGetRaw(pathUrl, key) {
  const url = `${HELENA}${pathUrl}`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    const body = await res.text();
    return { status: res.status, ok: res.ok, body, url };
  } catch (err) {
    const msg = err.name === "AbortError" ? "timeout (30s)" : (err.message || String(err));
    return { status: 0, ok: false, body: msg, url, networkError: true };
  }
}

async function helenaGet(pathUrl, key, clientId = null, onRequest = null) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    const r = await helenaGetRaw(pathUrl, key);
    const ms = Date.now() - t0;
    // Empurra pra event log global (sempre ligado)
    pushEvent("helena_request", {
      method: "GET", path: pathUrl, status: r.status, ms, attempt, clientId,
    });
    if (onRequest) onRequest({ method: "GET", path: pathUrl, status: r.status, ms, attempt });
    if (r.ok) {
      try { return JSON.parse(r.body); } catch { return r.body; }
    }
    if (r.status >= 400 && r.status < 500 && r.status !== 429) {
      throw new Error(`HTTP ${r.status} em ${pathUrl}: ${r.body.slice(0, 300)}`);
    }
    if (attempt === MAX_ATTEMPTS) {
      if (r.status === 429 && clientId) setClientLocked(clientId);
      const err = new Error(`Falhou após ${MAX_ATTEMPTS}x em ${pathUrl}: ${r.body.slice(0, 200)}`);
      err.code = r.status === 429 ? "RATE_LIMITED" : "HTTP_ERROR";
      throw err;
    }
    let waitMs;
    if (r.status === 429) {
      // RATE LIMIT — sempre espera 4 min e tenta de novo
      waitMs = LIMIT_WAIT_MS;
      retryStats.rate429++;
    }
    else if (r.networkError) {
      // 1ª tentativa: 1s (pode ser blip transitório)
      // 2ª em diante: 4 min (provavelmente Helena bloqueando)
      waitMs = attempt === 1 ? 1000 : LIMIT_WAIT_MS;
      retryStats.network++;
    }
    else {
      // 5xx: backoff linear curto
      waitMs = 1000 * attempt;
      retryStats.http5xx++;
    }
    retryStats.total++;
    if (onRequest) onRequest({ method: "GET", path: pathUrl, status: r.status, ms, attempt, retry_in_ms: waitMs });
    await sleep(waitMs);
  }
}

const extractItems = (r) => Array.isArray(r) ? r : (r?.items || r?.data || []);
const hasMorePages = (r, len, sz) => r?.hasMorePages ?? (len === sz);

const buildCardsUrl = (panelId, pn, sz, updatedAfter) => {
  const inc = ["StepTitle","StepPhase","PanelTitle","ResponsibleUser","CustomFields","Contacts"]
    .map((d) => `IncludeDetails=${d}`).join("&");
  let u = `/crm/v1/panel/card?PanelId=${panelId}&PageSize=${sz}&PageNumber=${pn}&${inc}`;
  if (updatedAfter) u += `&UpdatedAt.After=${encodeURIComponent(updatedAfter)}`;
  return u;
};

const SESSION_DETAIL_FIELDS = ["AgentDetails","DepartmentsDetails","ContactDetails","ChannelTypeDetails","ClassificationDetails","ChannelDetails"];
// Mesmo conjunto de detalhes para o LISTAGEM em lote (/chat/v2/session) — traz
// contactDetails.tagsName/tagsId, agentDetails, departmentDetails, utm, classification
// inline em cada item, sem precisar de request por sessão.
const SESSION_INCLUDE = SESSION_DETAIL_FIELDS.map((d) => `IncludeDetails=${d}`).join("&");
const buildSessionDetailUrl = (sid) => {
  const inc = SESSION_DETAIL_FIELDS.map((d) => `includeDetails=${d}`).join("&");
  return `/chat/v2/session/${encodeURIComponent(sid)}?${inc}`;
};

const buildChatUrl = (previewUrl, sessionId) => {
  if (!previewUrl || !sessionId) return null;
  const m = previewUrl.match(/^(https?:\/\/[^\/]+)/);
  return m ? `${m[1]}/chat2/sessions/${sessionId}` : null;
};

const classifyFunnel = (stepTitle) => {
  if (!stepTitle) return null;
  const s = stepTitle.toLowerCase();
  if (s.includes("sdr")) return "SDR";
  if (s.includes("closer") || s.includes("comercial")) return "CLOSER";
  if (s.includes("contrato") && (s.includes("assinado") || s.includes("fechado"))) return "ASSINADO";
  if (s.includes("contrato")) return "CONTRATO";
  if (s.includes("assinatura")) return "ASSINATURA";
  if (s.includes("desqualificado")) return "DESQUALIFICADO";
  if (s.includes("não seguiu") || s.includes("nao seguiu")) return "NAO_ASSINOU";
  return null;
};

// ============================================================
// Transformers (Helena JSON → DB row)
// ============================================================
function transformPanel(p, clientId, syncedAt) {
  return {
    client_id: clientId,
    helena_company_id: p.companyId || null,
    helena_panel_id: p.id,
    title: p.title || p.name || null,
    description: p.description || null,
    steps: p.steps || null,
    raw: p,
    created_at_helena: p.createdAt || null,
    updated_at_helena: p.updatedAt || null,
    synced_at: syncedAt,
  };
}

function transformCard(c, clientId, syncedAt) {
  const stepTitle = c.stepTitle || "";
  const funnelStage = classifyFunnel(stepTitle);
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const isStale = c.updatedAt && (Date.now() - new Date(c.updatedAt).getTime()) > SEVEN_DAYS_MS;
  let utmSource = null;
  const cf = c.customFields || {};
  if (Array.isArray(cf["conversa-iniciada-"]) && cf["conversa-iniciada-"][0]) {
    const v = cf["conversa-iniciada-"][0];
    if (!String(v).match(/^\d{4}-\d{2}-\d{2}T/)) utmSource = v;
  }
  return {
    id: c.id, client_id: clientId,
    helena_company_id: c.companyId || null,
    helena_panel_id: c.panelId,
    title: c.title || null,
    description: c.description || null,
    key: c.key || null,
    number: c.number || null,
    step_id: c.stepId || null,
    step_title: stepTitle || null,
    step_phase: c.stepPhase || null,
    funnel_stage: funnelStage,
    is_closed_contract: funnelStage === "ASSINADO",
    is_disqualified: funnelStage === "DESQUALIFICADO",
    is_stale: !!isStale,
    monetary_amount: c.monetaryAmount || null,
    responsible_user_id: c.responsibleUserId || null,
    responsible_user_name: c.responsibleUser?.name || null,
    contact_ids: c.contactIds || [],
    contact_names: (c.contacts || []).map((x) => x.name).filter(Boolean),
    tag_ids: c.tagIds || [],
    custom_fields: c.customFields || null,
    utm_source: utmSource,
    archived: c.archived === true,
    sessions_synced: false,
    raw: c,
    created_at_helena: c.createdAt || null,
    updated_at_helena: c.updatedAt || null,
    synced_at: syncedAt,
  };
}

function transformContact(c, clientId, syncedAt) {
  return {
    id: c.id, client_id: clientId,
    helena_company_id: c.companyId || null,
    name: c.name || null,
    name_whatsapp: c.nameWhatsapp || null,
    name_instagram: c.nameInstagram || null,
    name_messenger: c.nameMessenger || null,
    phone_number: c.phoneNumber || null,
    phone_number_formatted: c.phoneNumberFormatted || null,
    email: c.email || null,
    instagram: c.instagram || null,
    messenger_id: c.messengerId || null,
    annotation: c.annotation || null,
    tag_ids: c.tagIds || [],
    tag_names: c.tagNames || [],
    status: c.status || null,
    origin: c.origin || null,
    utm_source: c.utm?.source || null,
    utm_medium: c.utm?.medium || null,
    utm_campaign: c.utm?.campaign || null,
    utm_headline: c.utm?.headline || null,
    utm_referral_url: c.utm?.referralUrl || null,
    utm_clid: c.utm?.clid || null,
    utm_source_id: c.utm?.sourceId || null,
    imported_at: c.importedAt || null,
    custom_fields: c.customFields || null,
    portfolio_ids: c.portfolioIds || [],
    portfolio_names: c.portfolioNames || [],
    raw: c,
    created_at_helena: c.createdAt || null,
    updated_at_helena: c.updatedAt || null,
    synced_at: syncedAt,
  };
}

function transformSession(s, clientId, contactId, cardId, syncedAt, clientName = null) {
  return {
    id: s.id, client_id: clientId,
    helena_company_id: s.companyId || null,
    contact_id: contactId || s.contactId || null,
    card_id: cardId,
    number: s.number || null,
    status: s.status || null,
    status_description: s.statusDescription || null,
    type: s.type || null,
    channel_id: s.channelId || null,
    channel_type: s.channelType || null,
    channel_name: s.channelDetails?.displayName || s.channelDetails?.name || s.channelDetails?.platform || s.channelType || null,
    channel_phone: s.channelDetails?.humanId || null,
    channel_provider: s.channelDetails?.provider || null,
    agent_id: s.agentDetails?.id || null,
    agent_name: s.agentDetails?.name || s.agent?.name || null,
    department_id: s.departmentDetails?.id || s.departmentsDetails?.[0]?.id || null,
    department_name: s.departmentDetails?.name || s.departmentsDetails?.[0]?.name || null,
    classification: s.classification?.categoryName || s.classificationDetails?.name || s.classification?.name || null,
    classification_category: s.classification?.category || s.classificationDetails?.category || null,
    classification_amount: (s.classification?.amount ?? s.classificationDetails?.amount) || null,
    // Etiquetas (tags) do contato — vêm inline no list quando IncludeDetails=ContactDetails.
    // Guarda NULL (não []) quando vazio p/ o COALESCE no upsert preservar enriquecimentos anteriores.
    contact_tag_names: (s.contactDetails?.tagsName?.length ? s.contactDetails.tagsName : null),
    contact_tag_ids: (s.contactDetails?.tagsId?.length ? s.contactDetails.tagsId : null),
    time_service: s.timeService || null,
    window_status: s.windowStatus || null,
    unread_count: s.unreadCount || 0,
    last_message_text: s.lastMessageText || null,
    last_interaction_at: s.lastInteractionDate || null,
    last_message_in_at: s.lastMessageIn || null,
    last_message_out_at: s.lastMessageOut || null,
    first_response_at: s.firstResponseAt || null,
    preview_url: s.previewUrl || null,
    chat_url: buildChatUrl(s.previewUrl, s.id),
    utm_source: s.utm?.source || null,
    utm_medium: s.utm?.medium || null,
    utm_campaign: s.utm?.campaign || null,
    utm_headline: s.utm?.headline || null,
    utm_referral_url: s.utm?.referralUrl || null,
    utm_clid: s.utm?.clid || null,
    utm_source_id: s.utm?.sourceId || null,
    utm_content: s.utm?.content || null,
    utm_term: s.utm?.term || null,
    started_at: s.startAt || null,
    ended_at: s.endAt || null,
    created_at_helena: s.createdAt || null,
    updated_at_helena: s.updatedAt || null,
    // Novas colunas (Lovable-style) populadas pro dashboard
    session_created_at: s.createdAt || s.startAt || null,
    session_closed_at: s.closedAt || s.endAt || null,
    contact_name: s.contactDetails?.name || null,
    contact_phone: s.contactDetails?.phonenumberFormatted || s.contactDetails?.phonenumber || s.channelDetails?.humanId || null,
    contact_email: s.contactDetails?.email || null,
    session_detail_full: s,
    client_name: clientName,
    raw: s,
    synced_at: syncedAt,
  };
}

// ============================================================
// UPSERT helpers (usa jsonb_populate_recordset)
// ============================================================
async function upsertPanels(rows) {
  if (!rows.length) return 0;
  const sql = `
    INSERT INTO helena_panels (
      client_id, helena_company_id, helena_panel_id, title, description, steps, raw,
      created_at_helena, updated_at_helena, synced_at
    )
    SELECT client_id, helena_company_id, helena_panel_id, title, description, steps, raw,
           created_at_helena, updated_at_helena, synced_at
    FROM jsonb_populate_recordset(NULL::helena_panels, $1::jsonb)
    ON CONFLICT (client_id, helena_panel_id) DO UPDATE SET
      helena_company_id=EXCLUDED.helena_company_id,
      title=EXCLUDED.title, description=EXCLUDED.description,
      steps=EXCLUDED.steps, raw=EXCLUDED.raw,
      updated_at_helena=EXCLUDED.updated_at_helena, synced_at=EXCLUDED.synced_at`;
  await pool.query(sql, [JSON.stringify(rows)]);
  return rows.length;
}

async function upsertContacts(rows) {
  if (!rows.length) return 0;
  const sql = `
    INSERT INTO helena_contacts (
      id, client_id, helena_company_id, name, name_whatsapp, name_instagram, name_messenger,
      phone_number, phone_number_formatted, email, instagram, messenger_id,
      annotation, tag_ids, tag_names, status, origin,
      utm_source, utm_medium, utm_campaign, utm_headline, utm_referral_url,
      utm_clid, utm_source_id, imported_at, custom_fields, portfolio_ids,
      portfolio_names, raw, created_at_helena, updated_at_helena, synced_at
    )
    SELECT id, client_id, helena_company_id, name, name_whatsapp, name_instagram, name_messenger,
           phone_number, phone_number_formatted, email, instagram, messenger_id,
           annotation, tag_ids, tag_names, status, origin,
           utm_source, utm_medium, utm_campaign, utm_headline, utm_referral_url,
           utm_clid, utm_source_id, imported_at, custom_fields, portfolio_ids,
           portfolio_names, raw, created_at_helena, updated_at_helena, synced_at
    FROM jsonb_populate_recordset(NULL::helena_contacts, $1::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      helena_company_id=EXCLUDED.helena_company_id,
      name=EXCLUDED.name, phone_number_formatted=EXCLUDED.phone_number_formatted,
      email=EXCLUDED.email, tag_ids=EXCLUDED.tag_ids, tag_names=EXCLUDED.tag_names,
      status=EXCLUDED.status, utm_source=EXCLUDED.utm_source,
      utm_campaign=EXCLUDED.utm_campaign, custom_fields=EXCLUDED.custom_fields,
      raw=EXCLUDED.raw, updated_at_helena=EXCLUDED.updated_at_helena,
      synced_at=EXCLUDED.synced_at`;
  await pool.query(sql, [JSON.stringify(rows)]);
  return rows.length;
}

async function upsertCards(rows) {
  if (!rows.length) return 0;
  const sql = `
    INSERT INTO helena_cards (
      id, client_id, helena_company_id, panel_id, helena_panel_id, panel_title,
      title, description, key, number,
      step_id, step_title, step_phase, funnel_stage,
      is_closed_contract, is_disqualified, is_stale,
      monetary_amount, responsible_user_id, responsible_user_name,
      contact_ids, contact_names, tag_ids,
      custom_fields, utm_source, archived, sessions_synced,
      raw, created_at_helena, updated_at_helena, synced_at
    )
    SELECT c.id, c.client_id, c.helena_company_id, p.id, c.helena_panel_id, p.title,
           c.title, c.description, c.key, c.number,
           c.step_id, c.step_title, c.step_phase, c.funnel_stage,
           c.is_closed_contract, c.is_disqualified, c.is_stale,
           c.monetary_amount, c.responsible_user_id, c.responsible_user_name,
           c.contact_ids, c.contact_names, c.tag_ids,
           c.custom_fields, c.utm_source, c.archived, c.sessions_synced,
           c.raw, c.created_at_helena, c.updated_at_helena, c.synced_at
    FROM jsonb_populate_recordset(NULL::helena_cards, $1::jsonb) c
    LEFT JOIN helena_panels p ON p.client_id=c.client_id AND p.helena_panel_id=c.helena_panel_id
    ON CONFLICT (id) DO UPDATE SET
      helena_company_id=EXCLUDED.helena_company_id,
      panel_id=EXCLUDED.panel_id, panel_title=EXCLUDED.panel_title, title=EXCLUDED.title, step_id=EXCLUDED.step_id,
      step_title=EXCLUDED.step_title, step_phase=EXCLUDED.step_phase,
      funnel_stage=EXCLUDED.funnel_stage, is_closed_contract=EXCLUDED.is_closed_contract,
      is_disqualified=EXCLUDED.is_disqualified, is_stale=EXCLUDED.is_stale,
      monetary_amount=EXCLUDED.monetary_amount, responsible_user_id=EXCLUDED.responsible_user_id,
      responsible_user_name=EXCLUDED.responsible_user_name, contact_ids=EXCLUDED.contact_ids,
      contact_names=EXCLUDED.contact_names, tag_ids=EXCLUDED.tag_ids,
      custom_fields=EXCLUDED.custom_fields, utm_source=EXCLUDED.utm_source,
      archived=EXCLUDED.archived,
      -- SMART: só reseta sessions_synced=false se updated_at_helena MUDOU
      -- (card alterado → re-buscar sessions). Se não mudou, mantém o estado atual.
      sessions_synced = CASE
        WHEN helena_cards.updated_at_helena IS DISTINCT FROM EXCLUDED.updated_at_helena
        THEN FALSE
        ELSE helena_cards.sessions_synced
      END,
      raw=EXCLUDED.raw, updated_at_helena=EXCLUDED.updated_at_helena,
      synced_at=EXCLUDED.synced_at`;
  await pool.query(sql, [JSON.stringify(rows)]);
  return rows.length;
}

async function upsertSessions(rows) {
  if (!rows.length) return 0;
  const sql = `
    INSERT INTO helena_sessions (
      id, client_id, helena_company_id, contact_id, card_id,
      number, status, status_description, type,
      channel_id, channel_type, channel_name, channel_phone, channel_provider,
      agent_id, agent_name, department_id, department_name, classification,
      classification_category, classification_amount, contact_tag_names, contact_tag_ids,
      time_service, window_status, unread_count,
      last_message_text, last_interaction_at, last_message_in_at,
      last_message_out_at, first_response_at, preview_url, chat_url,
      utm_source, utm_medium, utm_campaign, utm_headline,
      utm_referral_url, utm_clid, utm_source_id, utm_content, utm_term,
      started_at, ended_at, created_at_helena, updated_at_helena, raw, synced_at,
      -- novas colunas Lovable
      session_created_at, session_closed_at, contact_name, contact_phone, contact_email,
      session_detail_full, client_name
    )
    SELECT id, client_id, helena_company_id, contact_id, card_id,
           number, status, status_description, type,
           channel_id, channel_type, channel_name, channel_phone, channel_provider,
           agent_id, agent_name, department_id, department_name, classification,
           classification_category, classification_amount, contact_tag_names, contact_tag_ids,
           time_service, window_status, unread_count,
           last_message_text, last_interaction_at, last_message_in_at,
           last_message_out_at, first_response_at, preview_url, chat_url,
           utm_source, utm_medium, utm_campaign, utm_headline,
           utm_referral_url, utm_clid, utm_source_id, utm_content, utm_term,
           started_at, ended_at, created_at_helena, updated_at_helena, raw, synced_at,
           session_created_at, session_closed_at, contact_name, contact_phone, contact_email,
           session_detail_full, client_name
    FROM jsonb_populate_recordset(NULL::helena_sessions, $1::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      helena_company_id=EXCLUDED.helena_company_id,
      -- COALESCE: o bulk (v2 list) NÃO traz contactDetails/channelDetails — então
      -- preservamos dados ricos (contato, telefone, tags, card_id) de syncs by-id.
      -- (contact_id sem COALESCE zerava o vínculo contato↔sessão que alimenta os enriquecimentos.)
      contact_id=COALESCE(EXCLUDED.contact_id, helena_sessions.contact_id),
      card_id=COALESCE(EXCLUDED.card_id, helena_sessions.card_id),
      status=EXCLUDED.status,
      agent_name=COALESCE(EXCLUDED.agent_name, helena_sessions.agent_name),
      department_name=COALESCE(EXCLUDED.department_name, helena_sessions.department_name),
      classification=COALESCE(EXCLUDED.classification, helena_sessions.classification),
      classification_category=COALESCE(EXCLUDED.classification_category, helena_sessions.classification_category),
      classification_amount=COALESCE(EXCLUDED.classification_amount, helena_sessions.classification_amount),
      contact_tag_names=COALESCE(EXCLUDED.contact_tag_names, helena_sessions.contact_tag_names),
      contact_tag_ids=COALESCE(EXCLUDED.contact_tag_ids, helena_sessions.contact_tag_ids),
      channel_name=COALESCE(EXCLUDED.channel_name, helena_sessions.channel_name),
      channel_phone=COALESCE(EXCLUDED.channel_phone, helena_sessions.channel_phone),
      time_service=EXCLUDED.time_service, window_status=EXCLUDED.window_status,
      unread_count=EXCLUDED.unread_count, last_message_text=EXCLUDED.last_message_text,
      last_interaction_at=EXCLUDED.last_interaction_at,
      chat_url=COALESCE(EXCLUDED.chat_url, helena_sessions.chat_url),
      preview_url=COALESCE(EXCLUDED.preview_url, helena_sessions.preview_url),
      ended_at=EXCLUDED.ended_at, raw=EXCLUDED.raw,
      updated_at_helena=EXCLUDED.updated_at_helena, synced_at=EXCLUDED.synced_at,
      -- utm: preenche se o novo trouxer (bulk traz utm), senão mantém
      utm_source=COALESCE(EXCLUDED.utm_source, helena_sessions.utm_source),
      utm_medium=COALESCE(EXCLUDED.utm_medium, helena_sessions.utm_medium),
      utm_campaign=COALESCE(EXCLUDED.utm_campaign, helena_sessions.utm_campaign),
      utm_headline=COALESCE(EXCLUDED.utm_headline, helena_sessions.utm_headline),
      utm_source_id=COALESCE(EXCLUDED.utm_source_id, helena_sessions.utm_source_id),
      utm_referral_url=COALESCE(EXCLUDED.utm_referral_url, helena_sessions.utm_referral_url),
      session_created_at = COALESCE(EXCLUDED.session_created_at, helena_sessions.session_created_at),
      session_closed_at = COALESCE(EXCLUDED.session_closed_at, helena_sessions.session_closed_at),
      contact_name = COALESCE(EXCLUDED.contact_name, helena_sessions.contact_name),
      contact_phone = COALESCE(EXCLUDED.contact_phone, helena_sessions.contact_phone),
      contact_email = COALESCE(EXCLUDED.contact_email, helena_sessions.contact_email),
      -- session_detail_full: só substitui se o novo tiver contactDetails (by-id); senão preserva o rico
      session_detail_full = CASE
        WHEN EXCLUDED.session_detail_full->'contactDetails' IS NOT NULL
         AND EXCLUDED.session_detail_full->'contactDetails' <> 'null'::jsonb
        THEN EXCLUDED.session_detail_full
        ELSE COALESCE(helena_sessions.session_detail_full, EXCLUDED.session_detail_full)
      END,
      client_name = COALESCE(EXCLUDED.client_name, helena_sessions.client_name)`;
  await pool.query(sql, [JSON.stringify(rows)]);
  return rows.length;
}

// ============================================================
// SYNC HIGH-LEVEL FUNCTIONS
// ============================================================
async function syncCards(client, opts, onProgress) {
  resetRetryStats();
  const syncedAt = new Date().toISOString();
  const { id: clientId, helena_api_key: key } = client;
  const { panelId: panelIdFilter = null } = opts || {};
  const state = startSync(clientId, "cards");
  const onReq = (info) => onProgress({ stage: "request", ...info });

  try {
    // sync_window
    let updatedAfter = null;
    const mode = opts?.mode || "first"; // 'first' (full), 'hourly' (só hoje), 'nightly' (full)
    if (mode === "hourly") {
      // Modo horário: pega só do dia (max entre last_sync e hoje_00h)
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const winRes = await pool.query("SELECT helena_get_sync_window($1::uuid, 5) AS w", [clientId]);
      const lastSync = winRes.rows[0]?.w;
      const start = (lastSync && lastSync > today) ? lastSync : today;
      updatedAfter = start.toISOString();
    }
    // mode === 'first' or 'nightly' → updatedAfter fica null = full sync
    const isFullSync = !updatedAfter;
    onProgress({
      stage: "cards-init",
      mode: isFullSync ? "full" : "incremental",
      updatedAfter,
      panelFilter: panelIdFilter,
    });

    // 1. Panels (busca todos sempre — barato, mantém DB atualizado)
    onProgress({ stage: "panels", message: "Buscando panels…" });
    const allPanels = [];
    let pn = 1;
    while (true) {
      if (isAborted(state)) { onProgress({ stage: "aborted", message: "cancelado em panels" }); return { aborted: true, counts: { panels: 0, cards: 0 } }; }
      const resp = await helenaGet(`/crm/v1/panel?PageNumber=${pn}&PageSize=100`, key, clientId, onReq);
      const items = extractItems(resp);
      allPanels.push(...items);
      if (!hasMorePages(resp, items.length, 100) || items.length === 0) break;
      pn++; await sleep(THROTTLE_MS);
    }
    const panelRows = allPanels.map((p) => transformPanel(p, clientId, syncedAt));
    await upsertPanels(panelRows);
    onProgress({ stage: "panels", message: `${allPanels.length} panels upserted`, panels: allPanels.length });

    // Filtra panels: opts.panelId (override UI) > client.panel_ids (config DB) > tudo
    let panels = allPanels;
    let filterSource = null;
    if (panelIdFilter) {
      panels = allPanels.filter((p) => p.id === panelIdFilter);
      filterSource = "override UI";
    } else if (client.panel_ids && client.panel_ids.length > 0) {
      panels = allPanels.filter((p) => client.panel_ids.includes(p.id));
      filterSource = `config cliente (${client.panel_ids.length} panels)`;
    }
    if (filterSource) {
      onProgress({
        stage: "panels",
        message: `Filtro [${filterSource}]: processando ${panels.length} panel(s) de ${allPanels.length}`,
      });
    }
    if (panelIdFilter && !panels.length) {
      onProgress({ stage: "panels", message: `⚠ panelId ${panelIdFilter.slice(0,8)}… não encontrado!` });
    }

    // 2. Cards (por panel)
    let totalCards = 0;
    let aborted = false;
    for (let pi = 0; pi < panels.length; pi++) {
      if (isAborted(state)) { aborted = true; break; }
      const panel = panels[pi];
      let pgn = 1;
      while (true) {
        if (isAborted(state)) { aborted = true; break; }
        const resp = await helenaGet(buildCardsUrl(panel.id, pgn, 100, updatedAfter), key, clientId, onReq);
        const items = extractItems(resp);
        if (items.length) {
          const cardRows = items.map((c) => transformCard({ ...c, panelId: panel.id }, clientId, syncedAt));
          await upsertCards(cardRows);
          totalCards += items.length;
        }
        onProgress({
          stage: "cards",
          message: `"${panel.title || panel.id.slice(0, 8)}" pg${pgn}: +${items.length}`,
          panelIndex: pi, panelTotal: panels.length, totalCards,
        });
        if (!hasMorePages(resp, items.length, 100) || items.length === 0) break;
        pgn++; await sleep(THROTTLE_MS);
      }
      if (pi < panels.length - 1) await sleep(THROTTLE_MS);
    }

    if (aborted) {
      onProgress({ stage: "aborted", message: `cancelado — ${totalCards} cards já salvos` });
      // NÃO marca sync completo se foi cancelado (pra próxima vez retomar)
      return { aborted: true, counts: { panels: panels.length, cards: totalCards }, retries: { ...retryStats } };
    }

    // Marca sync completo (só se NÃO foi cancelado E NÃO foi filtrado por panel)
    if (!panelIdFilter) {
      // Detecta se este foi o PRIMEIRO sync (era false antes)
      const wasFirstRes = await pool.query("SELECT first_sync_done FROM helena_clientes_crm WHERE id=$1", [clientId]);
      const wasFirstSync = wasFirstRes.rows[0]?.first_sync_done === false;

      await pool.query("SELECT helena_mark_sync_complete($1::uuid, $2::boolean)", [clientId, isFullSync]);

      if (wasFirstSync && isFullSync) {
        pushEvent("client_entered_cron", { clientId, name: client.name });
        console.log(`🤖 ${client.name} entrou no cron — gerenciado automaticamente`);
      }
    }

    return {
      counts: { panels: panels.length, cards: totalCards },
      mode: isFullSync ? "full" : "incremental",
      updatedAfter,
      panelFilter: panelIdFilter,
      retries: { ...retryStats },
    };
  } finally {
    endSync(clientId);
  }
}

async function syncSessions(client, opts, onProgress) {
  resetRetryStats();
  const syncedAt = new Date().toISOString();
  const { id: clientId, helena_api_key: key, name: clientName = null } = client;
  const { limit = 50, panelId = null, cardId: forceCardId = null, funnelStages = null } = opts || {};
  const state = startSync(clientId, "sessions");
  const onReq = (info) => onProgress({ stage: "request", ...info });

  try {
    // Filtro de panel: override (opts.panelId) > config cliente (client.panel_ids) > nenhum
    const panelFilter = panelId
      ? [panelId]
      : (client.panel_ids && client.panel_ids.length > 0 ? client.panel_ids : null);

    // Se foi pedido um cardId específico, ignora os filtros padrão e força aquele card
    let cardsRes;
    if (forceCardId) {
      cardsRes = await pool.query(
        "SELECT id, contact_ids FROM helena_cards WHERE id = $1 AND client_id = $2",
        [forceCardId, clientId]
      );
    } else if (funnelStages && funnelStages.length > 0) {
      // PRIORIZADO: filtra por etapa do funil (Closer, Contrato, Assinado, etc.)
      cardsRes = await pool.query(`
        SELECT hc.id, hc.contact_ids
          FROM helena_cards hc
          JOIN client_step_mappings m
            ON m.client_id = hc.client_id AND m.step_id = hc.step_id
         WHERE hc.client_id = $1
           AND hc.sessions_synced = FALSE
           AND array_length(hc.contact_ids, 1) > 0
           AND m.funnel_stage = ANY($3::text[])
         ORDER BY hc.updated_at_helena DESC NULLS LAST
         LIMIT $2`, [clientId, limit, funnelStages]);
    } else {
      const sqlBase = `
        SELECT id, contact_ids
          FROM helena_cards
         WHERE client_id = $1
           AND sessions_synced = FALSE
           AND array_length(contact_ids, 1) > 0
           ${panelFilter ? "AND helena_panel_id = ANY($3::text[])" : ""}
         ORDER BY updated_at_helena DESC NULLS LAST
         LIMIT $2`;
      const params = panelFilter ? [clientId, limit, panelFilter] : [clientId, limit];
      cardsRes = await pool.query(sqlBase, params);
    }
    const cards = cardsRes.rows;
    onProgress({ stage: "sessions-init", cardsToProcess: cards.length, panelFilter });

    let totalSessions = 0;
    let aborted = false;
    let cardsDone = 0;
    for (let ci = 0; ci < cards.length; ci++) {
      if (isAborted(state)) { aborted = true; break; }
      const card = cards[ci];
      const cardId = card.id;
      const contactIds = card.contact_ids || [];
      let cardSessions = 0;
      for (const cid of contactIds) {
        if (isAborted(state)) { aborted = true; break; }
        try {
          const list = await helenaGet(`/chat/v1/session?ContactId=${encodeURIComponent(cid)}`, key, clientId, onReq);
          const summaries = extractItems(list);
          const sessionRows = [];
          for (const s of summaries) {
            if (isAborted(state)) { aborted = true; break; }
            await sleep(THROTTLE_MS);
            try {
              const d = await helenaGet(buildSessionDetailUrl(s.id), key, clientId, onReq);
              sessionRows.push(transformSession(d, clientId, cid, cardId, syncedAt, clientName));
            } catch {
              sessionRows.push(transformSession(s, clientId, cid, cardId, syncedAt, clientName));
            }
          }
          if (sessionRows.length) {
            await upsertSessions(sessionRows);
            totalSessions += sessionRows.length;
            cardSessions += sessionRows.length;
          }
        } catch (e) {
          onProgress({ stage: "sessions", message: `erro contact ${cid.slice(0,8)}: ${e.message}` });
        }
        await sleep(THROTTLE_MS);
      }
      if (aborted) break;
      await pool.query("UPDATE helena_cards SET sessions_synced=TRUE, synced_at=now() WHERE id=$1", [cardId]);
      cardsDone++;
      onProgress({
        stage: "sessions",
        message: `card ${cardsDone}/${cards.length}: +${cardSessions} sessions`,
        cardsDone, cardsTotal: cards.length, totalSessions,
      });
    }

    if (aborted) {
      onProgress({ stage: "aborted", message: `cancelado — ${totalSessions} sessions já salvas em ${cardsDone}/${cards.length} cards` });
      return { aborted: true, counts: { cardsProcessed: cardsDone, sessions: totalSessions }, retries: { ...retryStats } };
    }
    return { counts: { cardsProcessed: cards.length, sessions: totalSessions }, retries: { ...retryStats } };
  } finally {
    endSync(clientId);
  }
}

// ============================================================
// SYNC DE SESSÕES EM LOTE (BULK) — /chat/v2/session paginado
// Busca 100 sessões por request usando totalPages da resposta.
// MUITO mais rápido que o per-card. mode:
//   'full'        → varre TODAS as páginas (1..totalPages) — popular do zero
//   'incremental' → varre da ÚLTIMA página (mais recentes) p/ trás,
//                   parando após `stopAfterKnown` páginas só com sessões já conhecidas.
// (OrderDirection é ignorado pela Helena: page1=mais antigo, última=mais recente)
// ============================================================
async function syncSessionsBulk(client, opts, onProgress) {
  resetRetryStats();
  const syncedAt = new Date().toISOString();
  const { id: clientId, helena_api_key: key, name: clientName = null } = client;
  const {
    pageSize = 100,
    mode = "full",
    maxPages = null,
    stopAfterKnown = 2,
  } = opts || {};
  const state = startSync(clientId, "sessions");
  const onReq = (info) => onProgress({ stage: "request", ...info });

  try {
    // 1. Mapa contato → card (sessão da v2 só traz contactId, não cardId)
    onProgress({ stage: "bulk-init", message: "Montando mapa contato→card…" });
    const mapRes = await pool.query(
      `SELECT id AS card_id, unnest(contact_ids) AS contact_id
         FROM helena_cards
        WHERE client_id = $1 AND array_length(contact_ids, 1) > 0
        ORDER BY updated_at_helena DESC NULLS LAST`,
      [clientId]
    );
    const contactToCard = new Map();
    for (const r of mapRes.rows) {
      if (!contactToCard.has(r.contact_id)) contactToCard.set(r.contact_id, r.card_id);
    }
    onProgress({ stage: "bulk-init", message: `mapa pronto: ${contactToCard.size} contatos` });

    // 2. Primeira página → metadados (totalPages/totalItems)
    const first = await helenaGet(
      `/chat/v2/session?${SESSION_INCLUDE}&PageNumber=1&PageSize=${pageSize}&OrderDirection=ASCENDING`,
      key, clientId, onReq
    );
    const totalPages = first.totalPages || 1;
    const totalItems = first.totalItems || 0;
    onProgress({ stage: "bulk-init", message: `Helena: ${totalItems} sessões em ${totalPages} páginas`, totalItems, totalPages, mode });

    let totalSessions = 0, matched = 0, unmatched = 0, pagesDone = 0, knownStreak = 0, aborted = false;

    const handlePage = async (items, pageNo) => {
      if (!items || !items.length) return { allKnown: true };
      const ids = items.map((s) => s.id);
      let knownSet = new Set();
      if (mode === "incremental") {
        const ex = await pool.query("SELECT id FROM helena_sessions WHERE id = ANY($1::text[])", [ids]);
        knownSet = new Set(ex.rows.map((r) => r.id));
      }
      const rows = items.map((s) => {
        const cid = s.contactId || null;
        const cardId = (cid && contactToCard.get(cid)) || null;
        if (cardId) matched++; else unmatched++;
        return transformSession(s, clientId, cid, cardId, syncedAt, clientName);
      });
      await upsertSessions(rows);
      totalSessions += rows.length;
      pagesDone++;
      onProgress({
        stage: "sessions",
        message: `página ${pageNo}/${totalPages}: +${rows.length} (com card ${matched}, sem card ${unmatched})`,
        page: pageNo, totalPages, totalSessions, matched, unmatched,
      });
      const allKnown = mode === "incremental" && ids.every((id) => knownSet.has(id));
      return { allKnown };
    };

    // Ordem de varredura
    const lastPage = maxPages ? Math.min(totalPages, maxPages) : totalPages;
    const order = [];
    if (mode === "incremental") {
      for (let p = totalPages; p >= 1; p--) order.push(p);
    } else {
      for (let p = 1; p <= lastPage; p++) order.push(p);
    }

    for (let i = 0; i < order.length; i++) {
      if (isAborted(state)) { aborted = true; break; }
      const pageNo = order[i];
      let items;
      if (pageNo === 1 && mode !== "incremental") {
        items = extractItems(first); // reaproveita a 1ª já buscada
      } else {
        await sleep(THROTTLE_MS);
        try {
          const pd = await helenaGet(
            `/chat/v2/session?${SESSION_INCLUDE}&PageNumber=${pageNo}&PageSize=${pageSize}&OrderDirection=ASCENDING`,
            key, clientId, onReq
          );
          items = extractItems(pd);
        } catch (e) {
          onProgress({ stage: "sessions", message: `erro página ${pageNo}: ${e.message}` });
          continue;
        }
      }
      const { allKnown } = await handlePage(items, pageNo);
      if (mode === "incremental") {
        if (allKnown) {
          knownStreak++;
          if (knownStreak >= stopAfterKnown) {
            onProgress({ stage: "sessions", message: `parada incremental: ${stopAfterKnown} páginas já conhecidas` });
            break;
          }
        } else knownStreak = 0;
      }
    }

    // 3. Marca cards que ganharam sessão como sincronizados
    await pool.query(
      `UPDATE helena_cards SET sessions_synced = TRUE
         WHERE client_id = $1
           AND id IN (SELECT DISTINCT card_id FROM helena_sessions WHERE client_id = $1 AND card_id IS NOT NULL)`,
      [clientId]
    );

    // 4. Enriquecimento (rede de segurança): com IncludeDetails o v2 list já traz
    //    contactDetails (nome/telefone/tags). Mantemos este fallback p/ sessões antigas
    //    sem contactDetails, preenchendo a partir de helena_contacts via contact_id.
    await pool.query(
      `UPDATE helena_sessions s
          SET contact_name  = COALESCE(s.contact_name, c.name),
              contact_phone = COALESCE(s.contact_phone, c.phone_number_formatted, c.phone_number),
              contact_tag_names = COALESCE(s.contact_tag_names, c.tag_names),
              contact_tag_ids   = COALESCE(s.contact_tag_ids, c.tag_ids::uuid[])
         FROM helena_contacts c
        WHERE c.id = s.contact_id
          AND s.client_id = $1
          AND (s.contact_name IS NULL OR s.contact_phone IS NULL
               OR (s.contact_tag_names IS NULL AND c.tag_names IS NOT NULL))`,
      [clientId]
    );

    onProgress({ stage: "bulk-done", message: `concluído: ${totalSessions} sessões em ${pagesDone} páginas (com card ${matched}, sem card ${unmatched})` });
    return { aborted, counts: { sessions: totalSessions, matched, unmatched, pagesDone, totalPages, totalItems }, retries: { ...retryStats } };
  } finally {
    endSync(clientId);
  }
}

// ============================================================
// SYNC DE CONTATOS EM LOTE (BULK) — /core/v1/contact paginado
// Mesma lógica do bulk de sessões. Traz nome, telefone E tags de TODOS os contatos.
// Depois, enriquece as sessões (telefone + tags) via contact_id.
// ============================================================
async function syncContactsBulk(client, opts, onProgress) {
  resetRetryStats();
  const syncedAt = new Date().toISOString();
  const { id: clientId, helena_api_key: key } = client;
  const { pageSize = 100, mode = "full", maxPages = null, stopAfterKnown = 2 } = opts || {};
  const state = startSync(clientId, "contacts");
  const onReq = (info) => onProgress({ stage: "request", ...info });

  try {
    const first = await helenaGet(
      `/core/v1/contact?PageNumber=1&PageSize=${pageSize}&OrderDirection=ASCENDING`,
      key, clientId, onReq
    );
    const totalPages = first.totalPages || 1;
    const totalItems = first.totalItems || 0;
    onProgress({ stage: "bulk-init", message: `Helena: ${totalItems} contatos em ${totalPages} páginas`, totalItems, totalPages, mode });

    let totalContacts = 0, pagesDone = 0, knownStreak = 0, aborted = false;

    const handlePage = async (items, pageNo) => {
      if (!items || !items.length) return { allKnown: true };
      const ids = items.map((c) => c.id);
      let knownSet = new Set();
      if (mode === "incremental") {
        const ex = await pool.query("SELECT id FROM helena_contacts WHERE id = ANY($1::text[])", [ids]);
        knownSet = new Set(ex.rows.map((r) => r.id));
      }
      const rows = items.map((c) => transformContact(c, clientId, syncedAt));
      await upsertContacts(rows);
      totalContacts += rows.length;
      pagesDone++;
      onProgress({ stage: "contacts", message: `página ${pageNo}/${totalPages}: +${rows.length}`, page: pageNo, totalPages, totalContacts });
      return { allKnown: mode === "incremental" && ids.every((id) => knownSet.has(id)) };
    };

    const lastPage = maxPages ? Math.min(totalPages, maxPages) : totalPages;
    const order = [];
    if (mode === "incremental") { for (let p = totalPages; p >= 1; p--) order.push(p); }
    else { for (let p = 1; p <= lastPage; p++) order.push(p); }

    for (let i = 0; i < order.length; i++) {
      if (isAborted(state)) { aborted = true; break; }
      const pageNo = order[i];
      let items;
      if (pageNo === 1 && mode !== "incremental") {
        items = extractItems(first);
      } else {
        await sleep(THROTTLE_MS);
        try {
          const pd = await helenaGet(`/core/v1/contact?PageNumber=${pageNo}&PageSize=${pageSize}&OrderDirection=ASCENDING`, key, clientId, onReq);
          items = extractItems(pd);
        } catch (e) {
          onProgress({ stage: "contacts", message: `erro página ${pageNo}: ${e.message}` });
          continue;
        }
      }
      const { allKnown } = await handlePage(items, pageNo);
      if (mode === "incremental") {
        if (allKnown) { knownStreak++; if (knownStreak >= stopAfterKnown) { onProgress({ stage: "contacts", message: `parada incremental: ${stopAfterKnown} páginas conhecidas` }); break; } }
        else knownStreak = 0;
      }
    }

    // Enriquece sessões: telefone + tags a partir dos contatos recém-completados
    const enr = await pool.query(
      `UPDATE helena_sessions s
          SET contact_name      = COALESCE(s.contact_name, c.name),
              contact_phone     = COALESCE(s.contact_phone, c.phone_number_formatted, c.phone_number),
              contact_tag_names = CASE WHEN c.tag_names IS NOT NULL AND array_length(c.tag_names, 1) > 0 THEN c.tag_names ELSE s.contact_tag_names END
         FROM helena_contacts c
        WHERE c.id = s.contact_id AND s.client_id = $1`,
      [clientId]
    );
    onProgress({ stage: "bulk-done", message: `concluído: ${totalContacts} contatos em ${pagesDone} páginas | ${enr.rowCount} sessões enriquecidas` });
    return { aborted, counts: { contacts: totalContacts, pagesDone, totalPages, totalItems, sessionsEnriched: enr.rowCount }, retries: { ...retryStats } };
  } finally {
    endSync(clientId);
  }
}

// ============================================================
// CASCATA DE CONTRATOS — quando um card está em "CONTRATO FECHADO",
// busca a nota do card (/crm/v1/panel/card/{id}/note) e popula
// contract_note + contract_parsed. Garante dados máximos dos assinados.
// ============================================================
function parseContractNoteServer(text) {
  if (!text || typeof text !== "string") return null;
  const clean = text.replace(/<[^>]+>/g, " ");
  const grab = (re) => { const m = clean.match(re); return m ? m[1].trim().replace(/\s+/g, " ") : null; };
  const caso = grab(/(?:📂\s*)?Caso\s*:?\s*([^\n📄📌🔖💰⭐📊]+)/i);
  const resumo = grab(/Resumo\s+do\s+caso\s*:?\s*([\s\S]+?)(?:📌|📄|💰|⭐|📊|Qualidade|Potencial|$)/i);
  // "📊 Qualidade do contrato:\nMédia — ..." → captura alta/média/baixa mesmo com quebra de linha
  const qRaw = grab(/Qualidade(?:\s+do\s+\w+)?\s*:?\s*\n?\s*(alta|m[ée]dia|baixa)/i);
  const qualidade = qRaw ? qRaw.toLowerCase().replace('media', 'média') : null;
  const potencial = grab(/Potencial(?:\s+retorno)?\s*:?\s*\n?\s*([\s\S]+?)(?:📌|📄|💰|⭐|📊|$)/i);
  if (!caso && !resumo && !qualidade) return null;
  return {
    caso: caso || null,
    resumo_caso: resumo || null,
    qualidade,
    potencial: potencial || null,
  };
}

async function syncContractNotes(client, opts, onProgress) {
  resetRetryStats();
  const { id: clientId, helena_api_key: key } = client;
  const { mode = "missing", limit = null } = opts || {}; // 'missing' (só sem nota) | 'all' (todos)
  const state = startSync(clientId, "contracts");
  const onReq = (info) => onProgress({ stage: "request", ...info });

  try {
    const cardsRes = await pool.query(
      `SELECT hc.id
         FROM helena_cards hc
         JOIN client_step_mappings sm ON sm.client_id = hc.client_id AND sm.step_id = hc.step_id
        WHERE hc.client_id = $1 AND hc.archived = false
          AND sm.funnel_stage = 'CONTRATO FECHADO'
          ${mode === "missing" ? "AND hc.contract_note IS NULL" : ""}
        ORDER BY hc.updated_at_helena DESC NULLS LAST
        ${limit ? `LIMIT ${parseInt(limit, 10)}` : ""}`,
      [clientId]
    );
    const cards = cardsRes.rows;
    onProgress({ stage: "contracts-init", total: cards.length, mode });

    let done = 0, withNote = 0, parsed = 0, aborted = false;
    for (const row of cards) {
      if (isAborted(state)) { aborted = true; break; }
      try {
        const r = await helenaGet(`/crm/v1/panel/card/${encodeURIComponent(row.id)}/note`, key, clientId, onReq);
        const items = (r && r.items) || [];
        if (items.length) {
          // Prioriza a nota "Contrato Assinado / Caso:"; senão a mais recente
          const main = items.find((n) => /contrato assinado|📂\s*caso|\bcaso\s*:/i.test(n.text || "")) || items[items.length - 1];
          const noteObj = { text: main.text || items.map((n) => n.text).filter(Boolean).join("\n\n"), createdAt: main.createdAt || null };
          const p = parseContractNoteServer(main.text || noteObj.text);
          await pool.query(
            "UPDATE helena_cards SET contract_note = $1::jsonb, contract_parsed = $2 WHERE id = $3",
            [JSON.stringify(noteObj), p ? JSON.stringify(p) : null, row.id]
          );
          withNote++;
          if (p) parsed++;
        } else {
          // Sem nota → marca {} pra não rebuscar toda hora (nightly 'all' revisita)
          await pool.query("UPDATE helena_cards SET contract_note = '{}'::jsonb WHERE id = $1 AND contract_note IS NULL", [row.id]);
        }
      } catch (e) {
        onProgress({ stage: "contracts", message: `erro card ${row.id.slice(0, 8)}: ${e.message}` });
      }
      done++;
      if (done % 25 === 0) onProgress({ stage: "contracts", message: `${done}/${cards.length} (com nota ${withNote}, parseadas ${parsed})`, done, total: cards.length, withNote, parsed });
      await sleep(THROTTLE_MS);
    }
    onProgress({ stage: "contracts-done", message: `concluído: ${done} cards, ${withNote} com nota, ${parsed} parseadas` });
    return { aborted, counts: { checked: done, withNote, parsed }, retries: { ...retryStats } };
  } finally {
    endSync(clientId);
  }
}

async function syncContacts(client, opts, onProgress) {
  resetRetryStats();
  const syncedAt = new Date().toISOString();
  const { id: clientId, helena_api_key: key } = client;
  const { limit = 100, panelId = null } = opts || {};
  const state = startSync(clientId, "contacts");
  const onReq = (info) => onProgress({ stage: "request", ...info });

  try {
    // Filtro de panel: override (opts.panelId) > config cliente (client.panel_ids) > nenhum
    const panelFilter = panelId
      ? [panelId]
      : (client.panel_ids && client.panel_ids.length > 0 ? client.panel_ids : null);

    const sql = `
      WITH all_ids AS (
        SELECT DISTINCT unnest(contact_ids) AS contact_id
          FROM helena_cards
         WHERE client_id = $1
           ${panelFilter ? "AND helena_panel_id = ANY($3::text[])" : ""}
      )
      SELECT a.contact_id
        FROM all_ids a
        LEFT JOIN helena_contacts hc ON hc.id = a.contact_id
       WHERE hc.id IS NULL
       LIMIT $2`;
    const params = panelFilter ? [clientId, limit, panelFilter] : [clientId, limit];
    const res = await pool.query(sql, params);
    const contactIds = res.rows.map((r) => r.contact_id);
    onProgress({ stage: "contacts-init", contactsToProcess: contactIds.length, panelFilter });

    let done = 0;
    let aborted = false;
    for (const cid of contactIds) {
      if (isAborted(state)) { aborted = true; break; }
      try {
        const c = await helenaGet(`/core/v1/contact/${encodeURIComponent(cid)}`, key, clientId, onReq);
        const row = transformContact(c, clientId, syncedAt);
        await upsertContacts([row]);
      } catch (e) {
        onProgress({ stage: "contacts", message: `erro ${cid.slice(0,8)}: ${e.message}` });
      }
      done++;
      onProgress({ stage: "contacts", done, total: contactIds.length });
      await sleep(THROTTLE_MS);
    }
    if (aborted) {
      onProgress({ stage: "aborted", message: `cancelado — ${done} contacts já salvos` });
      return { aborted: true, counts: { contacts: done }, retries: { ...retryStats } };
    }
    return { counts: { contacts: done }, retries: { ...retryStats } };
  } finally {
    endSync(clientId);
  }
}

// ============================================================
// HTTP server
// ============================================================
const server = http.createServer(async (req, res) => {
  // Endpoints de cron + event log (control panel)
  if (req.url.startsWith("/api/cron/") || req.url.startsWith("/api/sync-log") || req.url.startsWith("/api/events")) {
    if (cronEndpoints(req, res)) return;
  }

  // --- GET /sync → painel admin custom (cron, logs, redesign)
  if (req.method === "GET" && (req.url === "/sync" || req.url === "/sync/" || req.url === "/sync/index.html")) {
    try {
      const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500); res.end("index.html missing");
    }
    return;
  }

  // --- Serve estáticos do dashboard (Vite build) + SPA fallback
  if (req.method === "GET" && !req.url.startsWith("/api/")) {
    const DIST = path.join(__dirname, "..", "dashboard-app", "dist");
    const MIME = {
      ".html": "text/html; charset=utf-8",
      ".js":   "application/javascript; charset=utf-8",
      ".css":  "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg":  "image/svg+xml",
      ".png":  "image/png",
      ".jpg":  "image/jpeg",
      ".jpeg": "image/jpeg",
      ".ico":  "image/x-icon",
      ".woff": "font/woff",
      ".woff2":"font/woff2",
      ".ttf":  "font/ttf",
      ".map":  "application/json; charset=utf-8",
    };
    try {
      const urlPath = req.url.split("?")[0];
      let filePath;
      // Arquivos com extensão → arquivo direto
      if (path.extname(urlPath)) {
        filePath = path.join(DIST, urlPath);
      } else {
        // SPA fallback: qualquer rota sem extensão → index.html
        filePath = path.join(DIST, "index.html");
      }
      // Segurança: garantir que está dentro do DIST
      if (!filePath.startsWith(DIST)) {
        res.writeHead(403); res.end("Forbidden");
        return;
      }
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      // HTML: no-store (NUNCA cacheia → sempre pega o HTML que aponta pro bundle novo)
      // Assets (com hash no nome): cache longo, seguro pois o nome muda a cada build
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": ext === ".html"
          ? "no-store, no-cache, must-revalidate, max-age=0"
          : "public, max-age=31536000, immutable",
      });
      res.end(buf);
    } catch {
      // Se arquivo com extensão não existe → 404
      // Se sem extensão → fallback pro index.html (SPA route)
      if (path.extname(req.url.split("?")[0])) {
        res.writeHead(404); res.end("Not found");
      } else {
        try {
          const html = fs.readFileSync(path.join(DIST, "index.html"));
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          });
          res.end(html);
        } catch {
          res.writeHead(500); res.end("Dashboard build missing — rode `npm run build` em dashboard-app/");
        }
      }
    }
    return;
  }

  // --- GET /api/health
  if (req.method === "GET" && req.url === "/api/health") {
    try {
      const r = await pool.query("SELECT now() AS db_time, current_database() AS db_name");
      return json(res, { db: "ok", ...r.rows[0] });
    } catch (e) { return json(res, { db: "error", error: e.message }, 500); }
  }

  // --- GET /api/clients → lista de clientes ATIVOS + stats
  if (req.method === "GET" && req.url === "/api/clients") {
    try {
      const r = await pool.query(`
        SELECT
          c.id, c.name, c.slug, c.active,
          c.helena_company_id, c.panel_ids, c.notes,
          c.first_sync_done, c.last_synced_at, c.last_full_sync_at,
          (SELECT count(*) FROM helena_panels WHERE client_id=c.id)   AS panels_count,
          (SELECT count(*) FROM helena_cards WHERE client_id=c.id)    AS cards_count,
          (SELECT count(*) FROM helena_cards WHERE client_id=c.id AND sessions_synced=false) AS cards_pending_sessions,
          (SELECT count(*) FROM helena_sessions WHERE client_id=c.id) AS sessions_count,
          (SELECT count(*) FROM helena_contacts WHERE client_id=c.id) AS contacts_count
        FROM helena_clientes_crm c
        WHERE c.active = TRUE
        ORDER BY c.name;
      `);
      return json(res, { clients: r.rows });
    } catch (e) { return json(res, { error: e.message }, 500); }
  }

  // --- GET /api/admin/clients → lista TODOS com stats de funnel
  if (req.method === "GET" && req.url === "/api/admin/clients") {
    try {
      const r = await pool.query(`
        SELECT
          c.id, c.name, c.slug, c.active,
          c.helena_api_key, c.helena_company_id, c.panel_ids, c.panels_config,
          c.nivel_atencao, c.features, c.numeros_dashboard, c.step_mappings, c.notes,
          c.first_sync_done, c.last_synced_at, c.last_full_sync_at,
          c.created_at, c.updated_at,
          (SELECT count(*) FROM helena_panels WHERE client_id=c.id) AS panels_count,
          (SELECT count(*) FROM helena_cards  WHERE client_id=c.id AND archived=false) AS total_leads,
          (SELECT count(*) FROM helena_cards  WHERE client_id=c.id AND funnel_stage='SDR')            AS sdr,
          (SELECT count(*) FROM helena_cards  WHERE client_id=c.id AND funnel_stage='CLOSER')         AS closer,
          (SELECT count(*) FROM helena_cards  WHERE client_id=c.id AND funnel_stage='CONTRATO')       AS confeccao,
          (SELECT count(*) FROM helena_cards  WHERE client_id=c.id AND funnel_stage='ASSINATURA')     AS assinatura,
          (SELECT count(*) FROM helena_cards  WHERE client_id=c.id AND funnel_stage='ASSINADO')       AS assinado,
          (SELECT count(*) FROM helena_cards  WHERE client_id=c.id AND funnel_stage='DESQUALIFICADO') AS desqualificado,
          (SELECT count(*) FROM helena_cards  WHERE client_id=c.id AND funnel_stage='NAO_ASSINOU')    AS nao_assinou
        FROM helena_clientes_crm c
        ORDER BY c.active DESC, c.name ASC;
      `);
      // Adiciona status de lockout em memória
      const clients = r.rows.map((c) => ({
        ...c,
        lockedFor: getClientLockRemaining(c.id),
      }));
      return json(res, { clients });
    } catch (e) { return json(res, { error: e.message }, 500); }
  }

  // --- POST /api/admin/clients → criar cliente
  if (req.method === "POST" && req.url === "/api/admin/clients") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const b = JSON.parse(body || "{}");
        if (!b.name) throw new Error("name obrigatório");
        if (!b.helena_api_key) throw new Error("helena_api_key obrigatório");
        const r = await pool.query(
          `INSERT INTO helena_clientes_crm
             (name, slug, helena_api_key, helena_company_id, panel_ids, panels_config,
              nivel_atencao, features, numeros_dashboard, step_mappings, notes, active)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10::jsonb, $11, COALESCE($12, true))
           RETURNING *`,
          [
            b.name,
            b.slug || null,
            b.helena_api_key,
            b.helena_company_id || null,
            b.panel_ids || [],
            JSON.stringify(b.panels_config || []),
            b.nivel_atencao || 1,
            JSON.stringify(b.features || {}),
            b.numeros_dashboard || [],
            JSON.stringify(b.step_mappings || {}),
            b.notes || null,
            b.active !== false,
          ]
        );
        return json(res, { client: r.rows[0] });
      } catch (e) { return json(res, { error: e.message }, 500); }
    });
    return;
  }

  // --- PATCH /api/admin/clients/:id → atualizar
  if (req.method === "PATCH" && req.url.startsWith("/api/admin/clients/")) {
    const id = req.url.split("/").pop();
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const b = JSON.parse(body || "{}");
        const fields = [];
        const values = [];
        const allowed = ["name","slug","helena_api_key","helena_company_id","panel_ids","notes","active","nivel_atencao","numeros_dashboard","first_sync_done","last_synced_at","last_full_sync_at"];
        const jsonbFields = ["panels_config","features","step_mappings"];
        for (const k of allowed) {
          if (k in b) { values.push(b[k]); fields.push(`${k} = $${values.length}`); }
        }
        for (const k of jsonbFields) {
          if (k in b) { values.push(JSON.stringify(b[k])); fields.push(`${k} = $${values.length}::jsonb`); }
        }
        if (!fields.length) throw new Error("nada pra atualizar");
        values.push(id);
        const r = await pool.query(
          `UPDATE helena_clientes_crm SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING *`,
          values
        );
        if (!r.rows.length) throw new Error("cliente não encontrado");
        return json(res, { client: r.rows[0] });
      } catch (e) { return json(res, { error: e.message }, 500); }
    });
    return;
  }

  // --- DELETE /api/admin/clients/:id → deletar (CASCADE)
  if (req.method === "DELETE" && req.url.startsWith("/api/admin/clients/")) {
    const id = req.url.split("/").pop();
    try {
      const r = await pool.query("DELETE FROM helena_clientes_crm WHERE id = $1 RETURNING id", [id]);
      if (!r.rows.length) return json(res, { error: "cliente não encontrado" }, 404);
      return json(res, { deleted: r.rows[0].id });
    } catch (e) { return json(res, { error: e.message }, 500); }
  }

  // --- GET /api/admin/panels?clientId=X → lista panels disponíveis (do banco)
  if (req.method === "GET" && req.url.startsWith("/api/admin/panels")) {
    const u = new URL(req.url, "http://x");
    const clientId = u.searchParams.get("clientId");
    if (!clientId) return json(res, { error: "clientId obrigatório" }, 400);
    try {
      const r = await pool.query(
        `SELECT helena_panel_id, title, description
           FROM helena_panels
          WHERE client_id = $1
          ORDER BY title`,
        [clientId]
      );
      return json(res, { panels: r.rows });
    } catch (e) { return json(res, { error: e.message }, 500); }
  }

  // --- GET /api/preview?table=cards|sessions|contacts|panels&clientId=...
  if (req.method === "GET" && req.url.startsWith("/api/preview")) {
    const u = new URL(req.url, "http://x");
    const table = u.searchParams.get("table");
    const clientId = u.searchParams.get("clientId");
    const allowedTables = ["helena_cards","helena_sessions","helena_contacts","helena_panels"];
    const t = `helena_${table}`;
    if (!allowedTables.includes(t)) return json(res, { error: "table inválido" }, 400);
    try {
      const r = await pool.query(
        `SELECT * FROM ${t} WHERE client_id = $1 ORDER BY synced_at DESC LIMIT 20`,
        [clientId]
      );
      return json(res, { rows: r.rows });
    } catch (e) { return json(res, { error: e.message }, 500); }
  }

  // --- POST /api/sync-cards body: {clientId, panelId?}
  if (req.method === "POST" && req.url === "/api/sync-cards") {
    return runSyncEndpoint(req, res, syncCards);
  }
  if (req.method === "POST" && req.url === "/api/sync-sessions") {
    return runSyncEndpoint(req, res, syncSessions);
  }

  // --- POST /api/client-panels body: {apiKey?, clientId?}
  // Lista AO VIVO os painéis do cliente na Helena (GET /crm/v1/panel) pro admin
  // escolher quais sincronizar — sem precisar digitar UUID.
  if (req.method === "POST" && req.url === "/api/client-panels") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        let apiKey = parsed.apiKey;
        if (!apiKey && parsed.clientId) {
          const cRes = await pool.query("SELECT helena_api_key FROM helena_clientes_crm WHERE id=$1", [parsed.clientId]);
          if (cRes.rows.length) apiKey = cRes.rows[0].helena_api_key;
        }
        if (!apiKey) return json(res, { error: "apiKey obrigatório" }, 400);
        const resp = await helenaGet("/crm/v1/panel?PageNumber=1&PageSize=100", apiKey);
        const items = (resp?.items || []).map((p) => ({ id: p.id, title: p.title || "", cardCount: p.cardCount || 0 }));
        json(res, { panels: items });
      } catch (err) {
        console.error("client-panels err:", err);
        json(res, { error: err.message }, 500);
      }
    });
    return;
  }

  // --- POST /api/panel-steps body: {apiKey?, clientId?, panelIds?: []}
  // Busca AO VIVO as etapas (steps) dos painéis na Helena para o mapeamento no admin,
  // MESMO antes de qualquer sync. GET /crm/v1/panel/{id}?IncludeDetails=Steps
  if (req.method === "POST" && req.url === "/api/panel-steps") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        let apiKey = parsed.apiKey;
        let panelIds = Array.isArray(parsed.panelIds) ? parsed.panelIds.filter(Boolean) : [];
        // fallback: completa com o que estiver salvo no banco (cliente já existente)
        if ((!apiKey || panelIds.length === 0) && parsed.clientId) {
          const cRes = await pool.query("SELECT helena_api_key, panel_ids FROM helena_clientes_crm WHERE id=$1", [parsed.clientId]);
          if (cRes.rows.length) {
            apiKey = apiKey || cRes.rows[0].helena_api_key;
            if (panelIds.length === 0) panelIds = cRes.rows[0].panel_ids || [];
          }
        }
        if (!apiKey) return json(res, { error: "apiKey obrigatório" }, 400);
        if (!panelIds.length) return json(res, { error: "informe ao menos um painel" }, 400);

        const seen = new Map();
        const errors = [];
        for (const pid of panelIds) {
          try {
            const panel = await helenaGet(`/crm/v1/panel/${encodeURIComponent(pid)}?IncludeDetails=Steps`, apiKey);
            for (const s of panel?.steps || []) {
              if (s.archived) continue;
              if (!seen.has(s.id)) {
                seen.set(s.id, { step_id: s.id, step_title: s.title || "", panel_id: pid, panel_title: panel.title || "", position: s.position || 0 });
              }
            }
          } catch (e) {
            errors.push({ panel: pid, error: e.message });
            console.warn(`panel-steps ${pid}:`, e.message);
          }
        }
        const steps = Array.from(seen.values()).sort((a, b) => a.position - b.position);
        json(res, { steps, errors });
      } catch (err) {
        console.error("panel-steps err:", err);
        json(res, { error: err.message }, 500);
      }
    });
    return;
  }

  // --- POST /api/sync-sessions-bulk body: {clientId, mode?, maxPages?, pageSize?}
  // Sync de sessões EM LOTE via /chat/v2/session (100 por página, usa totalPages).
  // mode: 'full' (todas as páginas) | 'incremental' (newest-first, para cedo)
  if (req.method === "POST" && req.url === "/api/sync-sessions-bulk") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" });
      const send = (obj) => res.write(JSON.stringify(obj) + "\n");
      try {
        const parsed = JSON.parse(body || "{}");
        const clientId = parsed.clientId;
        if (!clientId) throw new Error("clientId obrigatório");
        const cRes = await pool.query(
          "SELECT id, name, helena_api_key, panel_ids FROM helena_clientes_crm WHERE id=$1",
          [clientId]
        );
        if (!cRes.rows.length) throw new Error("cliente não encontrado");
        const client = cRes.rows[0];
        const opts = {
          mode: parsed.mode || "full",
          maxPages: parsed.maxPages || null,
          pageSize: parsed.pageSize || 100,
          stopAfterKnown: parsed.stopAfterKnown || 2,
        };
        send({ type: "start", client: client.name, opts });
        const result = await syncSessionsBulk(client, opts, (p) => send({ type: "progress", ...p }));
        send({ type: "done", ...result });
      } catch (err) {
        console.error("Erro sync-bulk:", err);
        send({ type: "error", error: err.message });
      }
      res.end();
    });
    return;
  }
  if (req.method === "POST" && req.url === "/api/sync-contacts") {
    return runSyncEndpoint(req, res, syncContacts);
  }

  // --- POST /api/sync-contract-notes body: {clientId, mode?, limit?}
  // Cascata: busca a nota (/note) de cada card CONTRATO FECHADO e popula contract_note/parsed
  if (req.method === "POST" && req.url === "/api/sync-contract-notes") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" });
      const send = (obj) => res.write(JSON.stringify(obj) + "\n");
      try {
        const parsed = JSON.parse(body || "{}");
        if (!parsed.clientId) throw new Error("clientId obrigatório");
        const cRes = await pool.query("SELECT id, name, helena_api_key, panel_ids FROM helena_clientes_crm WHERE id=$1", [parsed.clientId]);
        if (!cRes.rows.length) throw new Error("cliente não encontrado");
        const opts = { mode: parsed.mode || "missing", limit: parsed.limit || null };
        send({ type: "start", client: cRes.rows[0].name, opts });
        const result = await syncContractNotes(cRes.rows[0], opts, (p) => send({ type: "progress", ...p }));
        send({ type: "done", ...result });
      } catch (err) {
        console.error("Erro sync-contract-notes:", err);
        send({ type: "error", error: err.message });
      }
      res.end();
    });
    return;
  }

  // --- POST /api/sync-contacts-bulk body: {clientId, mode?, maxPages?}
  if (req.method === "POST" && req.url === "/api/sync-contacts-bulk") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" });
      const send = (obj) => res.write(JSON.stringify(obj) + "\n");
      try {
        const parsed = JSON.parse(body || "{}");
        const clientId = parsed.clientId;
        if (!clientId) throw new Error("clientId obrigatório");
        const cRes = await pool.query("SELECT id, name, helena_api_key, panel_ids FROM helena_clientes_crm WHERE id=$1", [clientId]);
        if (!cRes.rows.length) throw new Error("cliente não encontrado");
        const opts = { mode: parsed.mode || "full", maxPages: parsed.maxPages || null, pageSize: parsed.pageSize || 100, stopAfterKnown: parsed.stopAfterKnown || 2 };
        send({ type: "start", client: cRes.rows[0].name, opts });
        const result = await syncContactsBulk(cRes.rows[0], opts, (p) => send({ type: "progress", ...p }));
        send({ type: "done", ...result });
      } catch (err) {
        console.error("Erro sync-contacts-bulk:", err);
        send({ type: "error", error: err.message });
      }
      res.end();
    });
    return;
  }

  // --- POST /api/sync-on-mount body: {clientId}
  // Chamado quando dashboard abre. Não bloqueia:
  //   1. Refresh client_metrics_cache (rápido, ~100ms)
  //   2. Dispara sync incremental em background (cards novos + sessions prioritários)
  if (req.method === "POST" && req.url === "/api/sync-on-mount") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const clientId = parsed.clientId;
        if (!clientId) return json(res, { error: "clientId obrigatório" }, 400);

        // 1. Refresh metrics cache (SÍNCRONO, rápido)
        const periods = [
          { key: "today", days: 1 },
          { key: "7d",    days: 7 },
          { key: "30d",   days: 30 },
          { key: "all",   days: 9999 },
        ];
        for (const p of periods) {
          const r = await pool.query(`
            SELECT count(*)::int AS total_leads,
              count(*) FILTER (WHERE m.funnel_stage='SDR')::int AS sdr,
              count(*) FILTER (WHERE m.funnel_stage='CLOSER')::int AS closer,
              count(*) FILTER (WHERE m.funnel_stage='CONTRATO')::int AS contrato,
              count(*) FILTER (WHERE m.funnel_stage='ASSINATURA')::int AS assinatura,
              count(*) FILTER (WHERE m.funnel_stage='ASSINADO')::int AS assinado,
              count(*) FILTER (WHERE m.funnel_stage='DESQUALIFICADO')::int AS desqualificado,
              count(*) FILTER (WHERE m.funnel_stage='NAO_ASSINOU')::int AS nao_assinou
            FROM helena_cards hc
            LEFT JOIN client_step_mappings m ON m.client_id=hc.client_id AND m.step_id=hc.step_id
            WHERE hc.client_id = $1
              AND ($2::int = 9999 OR hc.created_at_helena >= NOW() - ($2::int || ' days')::interval)
          `, [clientId, p.days]);
          const x = r.rows[0];
          const convRate = x.total_leads > 0 ? Math.round((x.assinado * 10000) / x.total_leads) / 100 : 0;
          await pool.query(`
            INSERT INTO client_metrics_cache (client_id, period, total_leads, sdr, closer, contrato, assinatura, assinado, desqualificado, nao_assinou, conversion_rate, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
            ON CONFLICT (client_id, period) DO UPDATE SET
              total_leads=EXCLUDED.total_leads, sdr=EXCLUDED.sdr, closer=EXCLUDED.closer,
              contrato=EXCLUDED.contrato, assinatura=EXCLUDED.assinatura, assinado=EXCLUDED.assinado,
              desqualificado=EXCLUDED.desqualificado, nao_assinou=EXCLUDED.nao_assinou,
              conversion_rate=EXCLUDED.conversion_rate, updated_at=now()
          `, [clientId, p.key, x.total_leads, x.sdr, x.closer, x.contrato, x.assinatura, x.assinado, x.desqualificado, x.nao_assinou, convRate]);
        }

        // 2. Dispara sync incremental em background (não bloqueia)
        // Só roda se ainda não tem sync ativo
        const status = await pool.query(
          "SELECT sync_status FROM helena_clientes_crm WHERE id=$1",
          [clientId]
        );
        const isIdle = !status.rows.length || status.rows[0].sync_status === "idle" || !status.rows[0].sync_status;

        let bgSyncTriggered = false;
        if (isIdle) {
          const cRes = await pool.query(
            "SELECT id, name, helena_api_key, panel_ids FROM helena_clientes_crm WHERE id=$1",
            [clientId]
          );
          if (cRes.rows.length) {
            const client = cRes.rows[0];
            // Sync horário (rápido) em background — não aguarda
            (async () => {
              let logId = null;
              let lockAcquired = false;
              try {
                lockAcquired = await acquireDbLock(clientId, "running_hourly", 1);
                if (!lockAcquired) return;
                logId = await startSyncLog(clientId, "on_mount");
                await syncCards(client, { mode: "hourly" }, () => {});
                // Sessões frescas via bulk incremental (newest-first, para cedo) — leve
                const sb = await syncSessionsBulk(client, { mode: "incremental", stopAfterKnown: 2 }, () => {});
                await endSyncLog(logId, { status: "success", sessions: sb?.counts?.sessions || 0 });
                logId = null;
              } catch (e) {
                console.warn("[sync-on-mount bg]", e.message);
                // Fecha o log mesmo no erro (senão fica "running" pra sempre)
                if (logId) { try { await endSyncLog(logId, { status: "error", error: e.message }); } catch {} }
              } finally {
                // Só libera SE adquiriu — senão destruiria o lock de outro sync em andamento.
                if (lockAcquired) await releaseDbLock(clientId);
              }
            })();
            bgSyncTriggered = true;
          }
        }

        // 3. Retorna ESTADO ATUAL pro frontend usar
        const stats = await pool.query(`
          SELECT
            (SELECT count(*) FROM helena_cards WHERE client_id=$1)::int AS cards,
            (SELECT count(*) FROM helena_sessions WHERE client_id=$1)::int AS sessions,
            (SELECT count(*) FROM helena_contacts WHERE client_id=$1)::int AS contacts,
            (SELECT max(synced_at) FROM helena_cards WHERE client_id=$1) AS last_card_sync
        `, [clientId]);

        return json(res, {
          success: true,
          metricsRefreshed: true,
          bgSyncTriggered,
          counts: stats.rows[0],
        });
      } catch (e) {
        console.error("[sync-on-mount]", e);
        return json(res, { error: e.message }, 500);
      }
    });
    return;
  }

  // --- POST /api/sync-sessions-priority body: {clientId, funnelStages?, limit?}
  // Sincroniza sessions priorizando cards das etapas escolhidas (default: ativas)
  if (req.method === "POST" && req.url === "/api/sync-sessions-priority") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" });
      const send = (obj) => res.write(JSON.stringify(obj) + "\n");
      try {
        const parsed = JSON.parse(body || "{}");
        const clientId = parsed.clientId;
        if (!clientId) { send({ error: "clientId obrigatório" }); res.end(); return; }
        const funnelStages = parsed.funnelStages || ["CLOSER", "CONTRATO", "ASSINATURA", "ASSINADO", "NAO_ASSINOU"];
        const limit = parsed.limit || 500;

        const cRes = await pool.query("SELECT id, name, helena_api_key, panel_ids FROM helena_clientes_crm WHERE id=$1", [clientId]);
        if (!cRes.rows.length) { send({ error: "cliente não encontrado" }); res.end(); return; }
        const client = cRes.rows[0];

        send({ type: "start", client: client.name, stages: funnelStages, limit });
        pushEvent("priority_sync_start", { clientId, stages: funnelStages, limit });

        const onProg = (p) => send({ type: "progress", ...p });
        const result = await syncSessions(client, { funnelStages, limit }, onProg);

        send({ type: "done", ...result });
      } catch (e) {
        console.error("[sync-sessions-priority]", e);
        send({ type: "error", error: e.message });
      } finally {
        res.end();
      }
    });
    return;
  }

  // --- POST /api/sync-card-sessions body: {cardId?, force?, bulk?}
  // Chama de fato a Helena pra trazer sessions do card específico em tempo real
  if (req.method === "POST" && req.url === "/api/sync-card-sessions") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");

        if (parsed.bulk) {
          return json(res, { success: true, mode: "bulk", message: "cron automático cuida do bulk" });
        }

        const cardId = parsed.cardId;
        if (!cardId) return json(res, { error: "cardId obrigatório" }, 400);

        // 1. Descobre o cliente desse card
        const cardRes = await pool.query(
          "SELECT client_id, contact_ids FROM helena_cards WHERE id = $1 LIMIT 1",
          [cardId]
        );
        if (!cardRes.rows.length) return json(res, { error: "card não encontrado" }, 404);
        const { client_id: clientId, contact_ids: contactIds } = cardRes.rows[0];

        if (!contactIds || !contactIds.length) {
          // Sem contato — marca como synced e retorna 0
          await pool.query("UPDATE helena_cards SET sessions_synced=true WHERE id=$1", [cardId]);
          return json(res, { success: true, sessionsCount: 0, message: "card sem contato" });
        }

        // 2. Pega credenciais do cliente
        const clRes = await pool.query(
          "SELECT id, name, helena_api_key, panel_ids FROM helena_clientes_crm WHERE id = $1",
          [clientId]
        );
        if (!clRes.rows.length) return json(res, { error: "cliente não encontrado" }, 404);
        const client = clRes.rows[0];

        // 3. Chama syncSessions com forceCardId — usa a mesma lógica completa do cron
        let count = 0;
        try {
          const result = await syncSessions(
            client,
            { cardId, limit: 1 },
            (p) => { if (p.totalSessions) count = p.totalSessions; }
          );
          count = result?.counts?.sessions || count;
        } catch (e) {
          return json(res, { error: "sync falhou: " + e.message }, 500);
        }

        // 4. Conta total agora no banco pra esse card
        const finalCount = await pool.query(
          "SELECT count(*)::int AS n FROM helena_sessions WHERE card_id = $1",
          [cardId]
        );

        return json(res, {
          success: true,
          mode: "single",
          cardId,
          newlySynced: count,
          totalInDb: finalCount.rows[0].n,
          message: count > 0 ? `${count} sessions sincronizadas` : "nenhuma session nova encontrada na Helena"
        });
      } catch (e) {
        console.error("[sync-card-sessions]", e);
        return json(res, { error: e.message }, 500);
      }
    });
    return;
  }

  // --- POST /api/sync-cascade-full body: {clientId}
  if (req.method === "POST" && req.url === "/api/sync-cascade-full") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" });
      const send = (obj) => res.write(JSON.stringify(obj) + "\n");
      let clientId, lockAcquired = false, logId = null;
      try {
        const parsed = JSON.parse(body || "{}");
        clientId = parsed.clientId;
        if (!clientId) throw new Error("clientId obrigatório");
        const cRes = await pool.query("SELECT id, name, helena_api_key, panel_ids FROM helena_clientes_crm WHERE id=$1", [clientId]);
        if (!cRes.rows.length) throw new Error("cliente não encontrado");
        const client = cRes.rows[0];

        // Adquire DB lock (impede cron horário de rodar simultaneamente)
        lockAcquired = await acquireDbLock(clientId, "running_full", 8);  // TTL 8h
        if (!lockAcquired) throw new Error("outro sync já está rodando — aguarde");
        logId = await startSyncLog(clientId, "cascade_full");

        send({ type: "start", client: client.name, mode: "cascade-full" });
        pushEvent("client_sync_start", { clientId, name: client.name, syncType: "cascade_full" });

        const onProg = (p) => send({ type: "progress", ...p });
        const BATCH = 500;
        const MAX_ROUNDS = 200;

        // 1. Cards (full sync) — marca first_sync_done=true + last_synced_at=NOW() ao final
        const cardsRes = await syncCards(client, { mode: "nightly" }, onProg);
        const totals = {
          panels: cardsRes?.counts?.panels || 0,
          cards: cardsRes?.counts?.cards || 0,
          sessions: 0,
          cardsProcessedSessions: 0,
          contacts: 0,
          rounds_sessions: 0,
          rounds_contacts: 0,
        };

        // 2. Sessions — loop até esvaziar
        for (let round = 1; round <= MAX_ROUNDS; round++) {
          onProg({ stage: "sessions-round", message: `Rodada ${round}/${MAX_ROUNDS}` });
          const r = await syncSessions(client, { limit: BATCH }, onProg);
          const processed = r?.counts?.cardsProcessed || 0;
          totals.sessions += r?.counts?.sessions || 0;
          totals.cardsProcessedSessions += processed;
          totals.rounds_sessions = round;
          if (processed === 0) {
            onProg({ stage: "sessions-round", message: `✓ sem mais cards pendentes (rodada ${round})` });
            break;
          }
          if (r?.aborted) break;
        }

        // 3. Contacts — loop até esvaziar
        for (let round = 1; round <= MAX_ROUNDS; round++) {
          onProg({ stage: "contacts-round", message: `Rodada ${round}/${MAX_ROUNDS}` });
          const r = await syncContacts(client, { limit: BATCH }, onProg);
          const done = r?.counts?.contacts || 0;
          totals.contacts += done;
          totals.rounds_contacts = round;
          if (done === 0) {
            onProg({ stage: "contacts-round", message: `✓ sem mais contacts pendentes (rodada ${round})` });
            break;
          }
          if (r?.aborted) break;
        }

        // 4. ATUALIZA last_synced_at = NOW() — assim cron horário pega delta a partir DAQUI
        await pool.query("SELECT helena_mark_sync_complete($1::uuid, TRUE)", [clientId]);
        await recomputeMetrics(clientId);
        onProg({ stage: "complete", message: "✓ cliente marcado como pronto pro cron horário" });
        pushEvent("client_entered_cron", { clientId, name: client.name });

        await endSyncLog(logId, { status: "success", cards: totals.cards, sessions: totals.sessions, contacts: totals.contacts });
        send({ type: "done", counts: totals });
        pushEvent("client_sync_end", { clientId, name: client.name, syncType: "cascade_full", status: "success", ...totals });
      } catch (err) {
        console.error("Erro cascade-full:", err);
        send({ type: "error", error: err.message });
        if (logId) await endSyncLog(logId, { status: "error", error: err.message });
      } finally {
        if (lockAcquired && clientId) await releaseDbLock(clientId);
      }
      res.end();
    });
    return;
  }

  // --- POST /api/sync-cancel body: {clientId} — para qualquer sync em andamento
  if (req.method === "POST" && req.url === "/api/sync-cancel") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { clientId } = JSON.parse(body || "{}");
        if (!clientId) return json(res, { error: "clientId obrigatório" }, 400);
        const ok = abortSync(clientId);
        return json(res, ok ? { cancelled: true, clientId } : { cancelled: false, message: "nenhum sync rodando pra esse cliente" });
      } catch (e) { return json(res, { error: e.message }, 500); }
    });
    return;
  }

  // --- GET /api/sync-status → lista o que está rodando
  if (req.method === "GET" && req.url === "/api/sync-status") {
    const active = [];
    for (const [clientId, s] of activeSyncs.entries()) {
      active.push({ clientId, type: s.type, startedAt: new Date(s.startedAt).toISOString(), aborting: s.abort });
    }
    return json(res, { active });
  }

  // --- GET /api/admin/numeros?clientId=X OR ?helenaCompanyId=X
  // Retorna números de telefone únicos das sessions desse cliente
  if (req.method === "GET" && req.url.startsWith("/api/admin/numeros")) {
    const u = new URL(req.url, "http://x");
    const clientId = u.searchParams.get("clientId");
    const companyId = u.searchParams.get("helenaCompanyId");
    if (!clientId && !companyId) return json(res, { error: "clientId ou helenaCompanyId obrigatório" }, 400);
    try {
      let sql, params;
      if (clientId) {
        sql = `SELECT DISTINCT channel_phone FROM helena_sessions
                WHERE client_id = $1 AND channel_phone IS NOT NULL AND channel_phone != ''
                ORDER BY channel_phone`;
        params = [clientId];
      } else {
        sql = `SELECT DISTINCT channel_phone FROM helena_sessions
                WHERE helena_company_id = $1 AND channel_phone IS NOT NULL AND channel_phone != ''
                ORDER BY channel_phone`;
        params = [companyId];
      }
      const r = await pool.query(sql, params);
      return json(res, { numeros: r.rows.map((row) => row.channel_phone) });
    } catch (e) { return json(res, { error: e.message }, 500); }
  }

  // --- GET /api/admin/etapas?clientId=X
  // Retorna etapas únicas (step_titles) dos cards desse cliente + sugestão de funnel_stage
  if (req.method === "GET" && req.url.startsWith("/api/admin/etapas")) {
    const u = new URL(req.url, "http://x");
    const clientId = u.searchParams.get("clientId");
    if (!clientId) return json(res, { error: "clientId obrigatório" }, 400);
    try {
      const r = await pool.query(
        `SELECT step_id, step_title, funnel_stage, count(*) as qtd
           FROM helena_cards
          WHERE client_id = $1 AND step_title IS NOT NULL
          GROUP BY step_id, step_title, funnel_stage
          ORDER BY count(*) DESC`,
        [clientId]
      );
      return json(res, { etapas: r.rows });
    } catch (e) { return json(res, { error: e.message }, 500); }
  }

  // --- POST /api/webhooks/helena → recebe webhooks da Helena
  // Insere em live_messages pra alimentar o Chat ao Vivo
  if (req.method === "POST" && req.url === "/api/webhooks/helena") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        // Identifica cliente pela company_id ou api_key no header
        const companyId = payload.companyId || req.headers["x-helena-company-id"];
        let clientId = null;
        if (companyId) {
          const c = await pool.query("SELECT id FROM helena_clientes_crm WHERE helena_company_id = $1", [companyId]);
          clientId = c.rows[0]?.id;
        }
        if (!clientId) {
          return json(res, { error: "cliente não identificado (companyId)" }, 400);
        }
        // Extrai dados da mensagem
        const sessionId = payload.sessionId || payload.session?.id;
        const contactId = payload.contactId || payload.contact?.id;
        const content = payload.message?.text || payload.body || payload.content;
        const direction = payload.direction || (payload.message?.fromMe ? "out" : "in");
        await pool.query(
          `INSERT INTO live_messages (client_id, contact_id, session_id, content, direction)
           VALUES ($1, $2, $3, $4, $5)`,
          [clientId, contactId, sessionId, content, direction]
        );
        pushEvent("live_message", { clientId, sessionId, direction, contentPreview: (content || "").slice(0, 80) });
        return json(res, { ok: true });
      } catch (e) {
        console.error("Webhook erro:", e.message);
        return json(res, { error: e.message }, 500);
      }
    });
    return;
  }

  // --- POST /api/notifications/test body: {clientId} → simula um relatório de teste
  if (req.method === "POST" && req.url === "/api/notifications/test") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { clientId } = JSON.parse(body || "{}");
        if (!clientId) throw new Error("clientId obrigatório");
        // Pega config Z-API + notification settings
        const cfg = await pool.query(
          `SELECT z.*, n.message_template, n.phone_number
             FROM helena_clientes_crm c
             LEFT JOIN zapi_config z ON z.client_id = c.id
             LEFT JOIN notification_settings n ON n.client_id = c.id
            WHERE c.id = $1 LIMIT 1`, [clientId]);
        const r = cfg.rows[0];
        if (!r?.instance_id || !r?.instance_token) {
          return json(res, { error: "Z-API não configurado (instance_id e token vazios)" }, 400);
        }
        // Stats do dia
        const stats = await pool.query(
          `SELECT count(*) FILTER (WHERE created_at_helena::date = current_date) AS novos,
                  count(*) FILTER (WHERE funnel_stage = 'ASSINADO') AS fechados
             FROM helena_cards WHERE client_id = $1`, [clientId]);
        const s = stats.rows[0];
        const msg = (r.message_template || "Relatório")
          .replace("{novos}", s.novos || 0)
          .replace("{fechados}", s.fechados || 0);
        // Aqui chamaria Z-API; por enquanto só retorna o que enviaria
        return json(res, {
          would_send: true,
          to: r.phone_number || "(sem telefone configurado)",
          message: msg,
          note: "Para enviar de verdade, configure instance_id+token + telefone destino e descomente a chamada Z-API"
        });
      } catch (e) {
        return json(res, { error: e.message }, 500);
      }
    });
    return;
  }

  res.writeHead(404); res.end("Not found");
});

async function runSyncEndpoint(req, res, syncFn) {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    res.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" });
    const send = (obj) => res.write(JSON.stringify(obj) + "\n");
    try {
      const parsed = JSON.parse(body || "{}");
      const clientId = parsed.clientId;
      if (!clientId) throw new Error("clientId obrigatório");
      const cRes = await pool.query("SELECT id, name, helena_api_key, panel_ids FROM helena_clientes_crm WHERE id=$1", [clientId]);
      if (!cRes.rows.length) throw new Error("cliente não encontrado");
      const client = cRes.rows[0];

      // opts uniformes: limit (sessions/contacts) + panelId (todos)
      const opts = {
        limit: parsed.limit,
        panelId: parsed.panelId || null,
      };
      send({ type: "start", client: client.name, opts });
      const result = await syncFn(client, opts, (p) => send({ type: "progress", ...p }));
      send({ type: "done", ...result });
    } catch (err) {
      console.error("Erro sync:", err);
      send({ type: "error", error: err.message });
    }
    res.end();
  });
}

function json(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ============================================================
// START
// ============================================================
// ============================================================
// SCHEDULER — Cron Horário + Cron Noturno
// ============================================================
// Crons habilitados POR PADRÃO — assim que um cliente completa Sync Total,
// já entra automaticamente na rotina do cron sem precisar ligar nada.
const cronState = {
  hourlyEnabled: true,
  nightlyEnabled: true,
  lastHourlyAt: null,
  lastNightlyAt: null,
  hourlyRunning: false,
  nightlyRunning: false,
  // Chaves de "já rodei nesta janela" — tornam o agendador auto-curável
  // (imune ao drift do setInterval e a ticks perdidos sob carga).
  lastHourlyKey: null,   // "YYYY-MM-DD-HH"
  lastNightlyKey: null,  // "YYYY-MM-DD"
};

// Chaves de janela baseadas no RELÓGIO (não no boot) — assim nunca "escorrega".
function hourKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}`;
}
function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Processa 1 cliente (extraído pra rodar em paralelo)
async function processOneClient(c, syncType) {
  if (getClientLockRemaining(c.id) > 0) {
    console.log(`  ⏭ pulando ${c.name} (lockout 429)`);
    pushEvent("client_skip", { clientId: c.id, name: c.name, reason: "lockout 429" });
    return;
  }
  const lockOk = await acquireDbLock(c.id, syncType === "hourly" ? "running_hourly" : "running_full");
  if (!lockOk) {
    console.log(`  ⏭ pulando ${c.name} (outro sync em curso)`);
    pushEvent("client_skip", { clientId: c.id, name: c.name, reason: "outro sync em curso" });
    return;
  }
  const logId = await startSyncLog(c.id, syncType);
  console.log(`  ▶ ${c.name}: ${syncType}`);
  pushEvent("client_sync_start", { clientId: c.id, name: c.name, syncType });
  let result = { status: "success", cards: 0, sessions: 0, contacts: 0 };
  try {
    // Ordem importante: cards → CONTACTS → sessions (sessions FK contact_id)
    const cardsRes = await syncCards(c, { mode: syncType === "hourly" ? "hourly" : "nightly" }, () => {});
    result.cards = cardsRes?.counts?.cards || 0;
    // CONTATOS via BULK (/core/v1/contact): hourly=incremental, nightly=full.
    // Enriquece telefone+tags das sessões automaticamente.
    const contRes = await syncContactsBulk(
      c,
      syncType === "hourly" ? { mode: "incremental", stopAfterKnown: 2 } : { mode: "full" },
      () => {}
    );
    result.contacts = contRes?.counts?.contacts || 0;

    // CASCATA DE CONTRATOS: busca a nota de cada card "Contrato Assinado".
    // hourly = só os novos (sem nota) | nightly = revisita todos (pega notas atualizadas).
    const ctrRes = await syncContractNotes(
      c,
      syncType === "hourly" ? { mode: "missing" } : { mode: "all" },
      () => {}
    );
    result.contracts = ctrRes?.counts?.withNote || 0;
    // SESSÕES via BULK (/chat/v2/session paginado):
    //   - hourly  → incremental: começa nas páginas mais recentes e para cedo (leve)
    //   - nightly → full: varre TODAS as páginas (lê totalPages fresco, adapta a qualquer cliente)
    const sessRes = await syncSessionsBulk(
      c,
      syncType === "hourly"
        ? { mode: "incremental", stopAfterKnown: 2 }
        : { mode: "full" },
      () => {}
    );
    result.sessions = sessRes?.counts?.sessions || 0;
    // Preenche channel_phone/channel_name das sessões que vieram sem número,
    // usando o channelId (sempre presente) + de-para das sessões já enriquecidas.
    // Sem isso, o filtro de Número só "enxergava" ~5% das sessões.
    await backfillChannelPhone(c.id);
    // Recalcula o cache de métricas (preview rápido do admin) após cada sync.
    await recomputeMetrics(c.id);
    console.log(`  ✓ ${c.name}: cards=${result.cards} sessions=${result.sessions} contacts=${result.contacts}`);
  } catch (e) {
    result.status = "error";
    result.error = e.message;
    console.error(`  ✗ ${c.name}: ${e.message}`);
  } finally {
    await endSyncLog(logId, result);
    await releaseDbLock(c.id);
    pushEvent("client_sync_end", {
      clientId: c.id, name: c.name, syncType,
      status: result.status,
      cards: result.cards, sessions: result.sessions, contacts: result.contacts,
      error: result.error,
    });
  }
  return result;
}

// Self-healing: preenche channel_phone/channel_name onde está NULL a partir do
// channelId (presente em session_detail_full de toda sessão) + de-para das sessões
// já enriquecidas do mesmo cliente. Roda após cada sync → mantém o filtro de Número
// funcionando mesmo que a Helena não devolva o humanId em todas as sessões.
async function backfillChannelPhone(clientId) {
  try {
    const r = await pool.query(
      `WITH mapa AS (
         SELECT DISTINCT ON (channel_id) channel_id, channel_phone, channel_name
         FROM (
           SELECT COALESCE(channel_id, session_detail_full->>'channelId') AS channel_id,
                  channel_phone, channel_name, count(*) n
           FROM helena_sessions
           WHERE client_id = $1 AND channel_phone IS NOT NULL
           GROUP BY 1, 2, 3
         ) g
         WHERE channel_id IS NOT NULL
         ORDER BY channel_id, n DESC
       )
       UPDATE helena_sessions s
          SET channel_phone = m.channel_phone,
              channel_name  = COALESCE(s.channel_name, m.channel_name)
         FROM mapa m
        WHERE s.client_id = $1
          AND COALESCE(s.channel_id, s.session_detail_full->>'channelId') = m.channel_id
          AND s.channel_phone IS NULL`,
      [clientId]
    );
    if (r.rowCount > 0) console.log(`  📞 channel_phone backfill: ${r.rowCount} sessão(ões)`);
  } catch (e) {
    console.warn("backfillChannelPhone falhou:", e.message);
  }
}

// Recalcula o cache de métricas do admin (RESUMO/preview rápido) nos 4 períodos.
async function recomputeMetrics(clientId) {
  try {
    for (const p of ["all", "today", "7d", "30d"]) {
      await pool.query("SELECT compute_client_metrics($1::uuid, $2)", [clientId, p]);
    }
  } catch (e) {
    console.warn("recomputeMetrics falhou:", e.message);
  }
}

async function runCronForAllClients(syncType) {
  console.log(`\n⏰ ${syncType.toUpperCase()} iniciado em ${new Date().toLocaleString("pt-BR")}`);
  pushEvent("cron_start", { syncType });
  const r = await pool.query(`
    SELECT id, name, helena_api_key, panel_ids
      FROM helena_clientes_crm
     WHERE active = TRUE
       AND first_sync_done = TRUE
       AND COALESCE((features->>'dashboard')::boolean, true) = true
     ORDER BY name`
  );
  console.log(`  → ${r.rows.length} cliente(s) ativos rodando em PARALELO`);
  pushEvent("cron_clients_found", { syncType, count: r.rows.length, parallel: true });

  // Roda TODOS em paralelo — cada cliente tem API key e rate limit independentes
  await Promise.all(
    r.rows.map((c) =>
      processOneClient(c, syncType).catch((e) => {
        console.error(`Erro em ${c.name}:`, e.message);
        pushEvent("client_sync_end", {
          clientId: c.id, name: c.name, syncType,
          status: "error", error: e.message,
        });
      })
    )
  );

  // ── Onboarding automático: clientes ATIVOS ainda SEM 1º sync entram sozinhos.
  // Faz um full (mode nightly) e marca first_sync_done=TRUE → na próxima rodada já
  // caem no cron normal. Cap de 3 por rodada (cada full é pesado; cada um tem token
  // próprio). Assim, importar/cadastrar cliente = ele começa a sincronizar sozinho.
  try {
    const pend = await pool.query(
      `SELECT id, name, helena_api_key, panel_ids
         FROM helena_clientes_crm
        WHERE active = TRUE AND first_sync_done = FALSE
          AND COALESCE((features->>'dashboard')::boolean, true) = true
          AND (sync_status IS NULL OR sync_status = 'idle')
        ORDER BY created_at
        LIMIT 3`
    );
    if (pend.rows.length) {
      console.log(`  🆕 onboarding ${pend.rows.length} cliente(s) novo(s) (1º sync completo)`);
      pushEvent("onboarding_start", { count: pend.rows.length });
      await Promise.all(
        pend.rows.map(async (nc) => {
          const res = await processOneClient(nc, "nightly").catch((e) => {
            console.error(`onboarding ${nc.name}:`, e.message);
            return { status: "error" };
          });
          if (res && res.status === "success") {
            await pool.query("SELECT helena_mark_sync_complete($1::uuid, TRUE)", [nc.id]).catch(() => {});
            pushEvent("client_entered_cron", { clientId: nc.id, name: nc.name });
            console.log(`  ✓ onboarded: ${nc.name} → entrou no cron`);
          }
        })
      );
    }
  } catch (e) {
    console.error("onboarding err:", e.message);
  }

  console.log(`✓ ${syncType.toUpperCase()} finalizado\n`);
  pushEvent("cron_end", { syncType });
}

async function safeRunCron(type) {
  if (type === "hourly") {
    if (cronState.hourlyRunning) return console.log("⏭ Hourly já rodando, skip");
    cronState.hourlyRunning = true;
    try { await runCronForAllClients("hourly"); cronState.lastHourlyAt = new Date().toISOString(); }
    finally { cronState.hourlyRunning = false; }
  } else if (type === "nightly") {
    if (cronState.nightlyRunning) return console.log("⏭ Nightly já rodando, skip");
    cronState.nightlyRunning = true;
    try { await runCronForAllClients("nightly"); cronState.lastNightlyAt = new Date().toISOString(); }
    finally { cronState.nightlyRunning = false; }
  }
}

// Tick a cada 30s: agendador AUTO-CURÁVEL baseado em chave de janela do relógio.
// Diferente do antigo `getMinutes() === 0` (que pulava a hora inteira quando o
// tick escorregava do minuto :00 sob carga), aqui comparamos a chave da janela
// atual com a última rodada. Se um tick foi perdido, o próximo ainda vê uma
// chave nova e roda → nunca fica horas sem sincronizar.
setInterval(() => {
  const now = new Date();
  const hk = hourKey(now);
  const dk = dayKey(now);

  // Horário: 1x por hora-relógio (roda em até 30s do início de cada hora; e
  // ~30s após o boot, garantindo dados frescos depois de qualquer restart).
  if (cronState.hourlyEnabled && !cronState.hourlyRunning && cronState.lastHourlyKey !== hk) {
    cronState.lastHourlyKey = hk; // marca ANTES do await → nunca duplica na mesma hora
    safeRunCron("hourly").catch((e) => console.error("Cron hourly err:", e));
  }

  // Noturno: 1x por dia, a partir das 3h (modo full/all, mais pesado).
  if (cronState.nightlyEnabled && !cronState.nightlyRunning && now.getHours() >= 3 && cronState.lastNightlyKey !== dk) {
    cronState.lastNightlyKey = dk;
    safeRunCron("nightly").catch((e) => console.error("Cron nightly err:", e));
  }
}, 30_000);

// Endpoints HTTP pra controlar cron — retorna true se tratou o request
const cronEndpoints = (req, res) => {
  if (req.method === "GET" && req.url === "/api/cron/status") {
    json(res, {
      hourly: { enabled: cronState.hourlyEnabled, running: cronState.hourlyRunning, lastRun: cronState.lastHourlyAt },
      nightly: { enabled: cronState.nightlyEnabled, running: cronState.nightlyRunning, lastRun: cronState.lastNightlyAt },
    });
    return true;
  }
  if (req.method === "POST" && req.url === "/api/cron/hourly/toggle") {
    cronState.hourlyEnabled = !cronState.hourlyEnabled;
    json(res, { enabled: cronState.hourlyEnabled });
    return true;
  }
  if (req.method === "POST" && req.url === "/api/cron/nightly/toggle") {
    cronState.nightlyEnabled = !cronState.nightlyEnabled;
    json(res, { enabled: cronState.nightlyEnabled });
    return true;
  }
  if (req.method === "POST" && req.url === "/api/cron/hourly/run-now") {
    safeRunCron("hourly").catch((e) => console.error(e));
    json(res, { triggered: "hourly" });
    return true;
  }
  if (req.method === "POST" && req.url === "/api/cron/nightly/run-now") {
    safeRunCron("nightly").catch((e) => console.error(e));
    json(res, { triggered: "nightly" });
    return true;
  }
  // GET /api/events?since=N → eventos do ring buffer global
  if (req.method === "GET" && req.url.startsWith("/api/events")) {
    const u = new URL(req.url, "http://x");
    const since = parseInt(u.searchParams.get("since"), 10) || 0;
    const events = getEventsSince(since);
    const last = serverEvents.length ? serverEvents[serverEvents.length - 1].id : since;
    json(res, { events, lastId: last });
    return true;
  }

  if (req.method === "GET" && req.url.startsWith("/api/sync-log")) {
    const u = new URL(req.url, "http://x");
    const limit = parseInt(u.searchParams.get("limit"), 10) || 30;
    pool.query(
      `SELECT l.*, c.name AS client_name
         FROM helena_sync_log l
         LEFT JOIN helena_clientes_crm c ON c.id = l.client_id
        ORDER BY l.started_at DESC LIMIT $1`,
      [limit]
    ).then((r) => json(res, { logs: r.rows })).catch((e) => json(res, { error: e.message }, 500));
    return true;
  }
  return false;
};

pool.query("SELECT 1").then(() => ensureSchema()).then(async () => {
  // Limpa logs órfãos: se o server foi reiniciado durante um sync, a linha
  // ficou "running" pra sempre. No boot, nada está rodando → marca como
  // interrompido (senão a UI mostra syncs "rodando" há horas, sem fim).
  try {
    const orphans = await pool.query(
      `UPDATE helena_sync_log
          SET status = 'interrupted', finished_at = NOW()
        WHERE status = 'running'
        RETURNING id`
    );
    if (orphans.rowCount > 0) console.log(`  ⚠ ${orphans.rowCount} log(s) órfão(s) marcados como 'interrupted'`);
  } catch (e) {
    console.warn("Limpeza de logs órfãos falhou:", e.message);
  }

  // Noturno é pesado (full/all): NÃO deve disparar a cada restart durante o dia.
  // Se já passou das 3h, considera a janela de hoje "feita"; antes das 3h, deixa
  // null para a janela das 3h de hoje ainda rodar normalmente.
  cronState.lastNightlyKey = new Date().getHours() >= 3 ? dayKey(new Date()) : null;

  // Horário: o tick regular NÃO dispara no boot (marcamos a hora atual como
  // "feita") pra não competir com a subida. Mas, pra garantir frescura após
  // QUALQUER deploy/restart, agendamos UM resync leve ~90s depois (ver abaixo).
  cronState.lastHourlyKey = hourKey(new Date());

  console.log("");
  console.log("  ╔════════════════════════════════════════════════╗");
  console.log("  ║  Helena Sync Local v2 — DB conectado ✓         ║");
  console.log(`  ║  → http://localhost:${PORT}                       ║`);
  console.log("  ║                                                ║");
  console.log("  ║  Endpoints:                                    ║");
  console.log("  ║   GET  /                                       ║");
  console.log("  ║   GET  /api/health                             ║");
  console.log("  ║   GET  /api/clients                            ║");
  console.log("  ║   GET  /api/preview?table=cards&clientId=...   ║");
  console.log("  ║   POST /api/sync-cards    {clientId}           ║");
  console.log("  ║   POST /api/sync-sessions {clientId,limit}     ║");
  console.log("  ║   POST /api/sync-contacts {clientId,limit}     ║");
  console.log("  ╚════════════════════════════════════════════════╝");
  console.log("");
  server.listen(PORT);

  // Resync ÚNICO ~90s após o boot: garante dados frescos depois de qualquer
  // deploy/restart sem competir com a subida (o dashboard lê do Supabase REST,
  // não deste pool). Não duplica: safeRunCron tem guard (hourlyRunning) e o tick
  // regular já considera a hora atual "feita". Roda 1x; a próxima é no fim da hora.
  setTimeout(() => {
    if (cronState.hourlyEnabled && !cronState.hourlyRunning) {
      console.log("⏳ Resync pós-boot (hourly leve)...");
      safeRunCron("hourly").catch((e) => console.error("Resync pós-boot err:", e));
    }
  }, 90_000);
}).catch((e) => {
  console.error("❌ Erro conectando ao DB:", e.message);
  console.error("Verifica DB_HOST/DB_USER/DB_PASS no .env");
  process.exit(1);
});
