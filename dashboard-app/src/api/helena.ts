import { supabase } from '@/integrations/supabase/client';

export interface Card {
  id: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  panelId: string;
  panelTitle: string;
  stepId: string;
  stepTitle: string;
  stepPhase: string;
  title: string;
  key: string;
  number: number;
  dueDate: string | null;
  isOverdue: boolean;
  tagIds: string[];
  tagsName: string[];
  monetaryAmount: number | null;
  responsibleUser: { name: string } | null;
  contactIds: string[];
  contacts: Array<{ id: string; name: string }>;
  customFields: {
    'conversa-iniciada-'?: string[];
    'texto-campanha'?: string;
    'an-ncio'?: string;
    [key: string]: any;
  };
  metadata: any;
  position?: number;
  description?: string | null;
  companyId?: string;
  responsibleUserId?: string | null;
  sessionId?: string | null;
  contractNote?: any;
  contractParsed?: any;
}

export interface FetchProgress {
  currentPage: number;
  totalFound: number;
  status: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Fetch cards from the database cache (instant)
function mapCardRow(row: any): Card {
  return {
    id: row.id,
    // Fallback: nosso server.js usa created_at_helena/updated_at_helena;
    // Lovable usa created_at/updated_at. Pega o que tiver.
    createdAt: row.created_at_helena || row.created_at,
    updatedAt: row.updated_at_helena || row.updated_at,
    archived: row.archived,
    panelId: row.helena_panel_id || row.panel_id,
    panelTitle: row.panel_title || row.raw?.panelTitle,
    stepId: row.step_id,
    stepTitle: row.step_title,
    stepPhase: row.step_phase,
    title: row.title,
    key: row.key,
    number: row.number,
    dueDate: row.due_date || row.raw?.dueDate,
    isOverdue: row.is_overdue ?? row.raw?.isOverdue,
    tagIds: row.tag_ids || [],
    tagsName: row.tags_name?.length ? row.tags_name : (row.raw?.tagsName || []),
    monetaryAmount: row.monetary_amount,
    responsibleUser: row.responsible_user || row.raw?.responsibleUser || (row.responsible_user_name ? { name: row.responsible_user_name, id: row.responsible_user_id } : null),
    contactIds: row.contact_ids || [],
    contacts: (Array.isArray(row.contacts) && row.contacts.length ? row.contacts : (row.raw?.contacts || [])),
    customFields: row.custom_fields || {},
    metadata: row.metadata || row.raw?.metadata,
    position: row.position ?? row.raw?.position,
    description: row.description,
    companyId: row.company_id || row.helena_company_id,
    responsibleUserId: row.responsible_user_id,
    sessionId: row.session_id || row.raw?.sessionId,
    contractNote: row.contract_note,
    contractParsed: row.contract_parsed,
  } as Card;
}

// Conta total de cards/sessões (COUNT head, sem trazer linhas) — usado para a
// % REAL da tela de carregamento. Tolerante a erro (retorna 0 se falhar).
export async function fetchCounts(clientId?: string): Promise<{ cards: number; sessions: number }> {
  const countOf = async (table: string): Promise<number> => {
    try {
      // 'estimated' usa a estatística do planner (pg_class.reltuples) → instantâneo
      // e SEM varredura de tabela (não pesa CPU). Suficiente p/ a % de loading.
      let q = supabase.from(table).select('id', { count: 'estimated', head: true });
      if (clientId) q = q.eq('client_id', clientId);
      const { count } = await q;
      return count || 0;
    } catch { return 0; }
  };
  const [cards, sessions] = await Promise.all([countOf('helena_cards'), countOf('helena_sessions')]);
  return { cards, sessions };
}

// Colunas explícitas SEM `raw` (o JSON completo da Helena, vários KB por card →
// pesava muito CPU/banda no Supabase ao puxar 14k cards). Todos os campos que o
// app usa têm coluna dedicada; o `raw` só era fallback e os dedicados cobrem.
const CARD_COLS = [
  'id', 'client_id', 'panel_id', 'helena_panel_id', 'title', 'description', 'key', 'number',
  'step_id', 'step_title', 'step_phase', 'funnel_stage', 'is_closed_contract', 'is_disqualified',
  'is_stale', 'monetary_amount', 'responsible_user_id', 'responsible_user_name', 'contact_ids',
  'contact_names', 'tag_ids', 'custom_fields', 'utm_source', 'contract_note', 'contract_parsed',
  'archived', 'sessions_synced', 'created_at_helena', 'updated_at_helena', 'synced_at',
  'created_at', 'updated_at', 'helena_company_id', 'panel_title', 'due_date', 'is_overdue',
  'responsible_user', 'contacts', 'metadata', 'position', 'company_id', 'session_id',
  'tags_name', 'client_name',
].join(',');

// onPage (opcional): chamado a cada (poucas) páginas com o acumulado mapeado.
// O carregamento agora segura a tela de loading até 100% (a % real vem dos counts).
export async function fetchCardsFromDB(
  clientId?: string,
  onPage?: (cards: Card[], syncedAt: string | null) => void,
): Promise<{ cards: Card[]; syncedAt: string | null }> {
  const cards: Card[] = [];
  let lastId = '';
  let syncedAt: string | null = null;
  let page = 0;
  const pageSize = 1000;

  // KEYSET pagination por id (id > lastId). Robusto contra:
  //  - escrita concorrente do sync (.range/offset pula linhas → caía pra 2.896)
  //  - página curta sob carga (statement timeout do Postgres) — keyset só termina no fim REAL.
  while (true) {
    // RETRY por página: o sync (cron) pode deixar o Postgres lento por alguns
    // segundos → erro transitório. Em vez de abortar (e o dashboard travar numa
    // página só, ex.: 1.000), tentamos a MESMA página de novo com backoff.
    let data: any[] | null = null;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 8; attempt++) {
      let query = supabase
        .from('helena_cards')
        .select(CARD_COLS)
        .gt('id', lastId)
        .order('id', { ascending: true })
        .limit(pageSize);
      if (clientId) query = query.eq('client_id', clientId);
      const res = await query;
      if (!res.error) { data = res.data as any[]; lastErr = null; break; }
      lastErr = res.error;
      await new Promise(r => setTimeout(r, Math.min(500 * attempt, 3000)));
    }
    if (lastErr) {
      // Mantém o parcial já carregado; o refresh seguinte completa.
      console.warn('[fetchCardsFromDB] página falhou após retries — mantendo parcial:', lastErr.message);
      break;
    }
    if (!data || data.length === 0) break;
    if (syncedAt === null) syncedAt = data[0]?.synced_at || null;
    for (const row of data) cards.push(mapCardRow(row));
    lastId = data[data.length - 1].id;
    page++;
    const isLast = data.length < pageSize;
    // emite a cada página → % real sobe suave (tela de dashboard nem renderiza ainda)
    if (onPage) onPage(cards.slice(), syncedAt);
    if (isLast) break;
  }

  return { cards, syncedAt };
}

// Trigger sync via nosso server.js local — não bloqueia, cron horário cuida
export async function triggerSync(panelId?: string): Promise<void> {
  // No-op leve: o cron horário do server.js já sincroniza tudo automaticamente.
  // Mantemos a função pra não quebrar callers, mas só retorna.
  console.log('[triggerSync] no-op (cron automático cuida da sync)', { panelId });
  return;
}

// Fetch sessions from the database
export interface Session {
  id: string;
  cardId: string;
  contactId: string;
  status: string | null;
  sessionCreatedAt: string | null;
  sessionClosedAt: string | null;
  agentName: string | null;
  departmentName: string | null;
  channelType: string | null;
  channelName: string | null;
  classification: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  utmSource: string | null;
  utmSourceId: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmHeadline: string | null;
  utmTerm: string | null;
  utmReferralUrl: string | null;
  utmClid: string | null;
  sessionDetailFull: any;
  contactTagNames: string[];
  syncedAt: string;
}

function mapSessionRow(row: any): Session {
  return {
    id: row.id,
    cardId: row.card_id,
    contactId: row.contact_id,
    status: row.status,
    // Nosso server.js usa started_at/ended_at; Lovable usa session_created_at/closed_at
    sessionCreatedAt: row.session_created_at || row.started_at || row.created_at_helena,
    sessionClosedAt: row.session_closed_at || row.ended_at,
    agentName: row.agent_name,
    departmentName: row.department_name,
    channelType: row.channel_type,
    channelName: row.channel_name,
    classification: row.classification,
    contactName: row.contact_name,
    contactPhone: row.contact_phone || row.channel_phone,
    contactEmail: row.contact_email,
    utmSource: row.utm_source,
    utmSourceId: row.utm_source_id,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
    utmHeadline: row.utm_headline,
    utmTerm: row.utm_term,
    utmReferralUrl: row.utm_referral_url,
    utmClid: row.utm_clid,
    // Slim: só o que o front usa (previewUrl no audit, humanId no filtro de número).
    // O JSON completo (~3KB) ficou fora do fetch — buscado on-demand se precisar.
    sessionDetailFull: {
      previewUrl: row.preview_url || row.chat_url || null,
      channelDetails: row.channel_phone ? { humanId: row.channel_phone } : undefined,
    },
    contactTagNames: row.contact_tag_names || [],
    syncedAt: row.synced_at,
  } as Session;
}

export async function fetchSessionsFromDB(
  clientId?: string,
  onPage?: (sessions: Session[]) => void,
): Promise<Session[]> {
  const sessions: Session[] = [];
  let lastId = '';
  let page = 0;
  const pageSize = 1000;

  // Colunas explícitas SEM `raw` E SEM `session_detail_full` (juntos ~3KB/linha × 21k = ~60MB!).
  // previewUrl e humanId são reconstruídos das colunas dedicadas (preview_url, channel_phone).
  const SESSION_COLS = [
    'id','card_id','contact_id','status','session_created_at','started_at','created_at_helena',
    'session_closed_at','ended_at','agent_name','department_name','channel_type','channel_name',
    'channel_phone','classification','contact_name','contact_phone','contact_email',
    'utm_source','utm_source_id','utm_medium','utm_campaign','utm_content','utm_headline',
    'utm_term','utm_referral_url','utm_clid','preview_url','chat_url','contact_tag_names','synced_at',
  ].join(',');

  // KEYSET por id — robusto contra escrita concorrente e página curta sob carga.
  while (true) {
    // RETRY por página (mesmo motivo do fetchCardsFromDB): não aborta no 1º erro.
    let data: any[] | null = null;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 8; attempt++) {
      let query = supabase
        .from('helena_sessions')
        .select(SESSION_COLS)
        .gt('id', lastId)
        .order('id', { ascending: true })
        .limit(pageSize);
      if (clientId) query = query.eq('client_id', clientId);
      const res = await query;
      if (!res.error) { data = res.data as any[]; lastErr = null; break; }
      lastErr = res.error;
      await new Promise(r => setTimeout(r, Math.min(500 * attempt, 3000)));
    }
    if (lastErr) {
      console.warn('[fetchSessionsFromDB] página falhou após retries — mantendo parcial:', lastErr.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) sessions.push(mapSessionRow(row));
    lastId = (data[data.length - 1] as any).id;
    page++;
    const isLast = data.length < pageSize;
    // emite a cada página → % real sobe suave
    if (onPage) onPage(sessions.slice());
    if (isLast) break;
  }

  return sessions;
}

// Trigger sessions sync via nosso server.js local
export async function triggerSessionsSync(): Promise<any> {
  const response = await fetch(`/api/sync-card-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bulk: true }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Sessions sync failed');
  }
  return data;
}

// Legacy: fetch directly from API via proxy (fallback)
export async function fetchAllCards(
  onProgress?: (progress: FetchProgress) => void
): Promise<Card[]> {
  const allCards: Card[] = [];
  let pageNumber = 1;
  const pageSize = 100;
  let hasMorePages = true;

  const statuses = [
    'Conectando à API...',
    'Buscando leads...',
    'Processando etapas...',
    'Calculando métricas...',
    'Quase pronto...',
  ];

  while (hasMorePages) {
    const statusIndex = Math.min(Math.floor((pageNumber - 1) / 2), statuses.length - 1);
    onProgress?.({
      currentPage: pageNumber,
      totalFound: allCards.length,
      status: statuses[statusIndex],
    });

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/helena-proxy?pageNumber=${pageNumber}&pageSize=${pageSize}`,
      {
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const data = await response.json();
    const items = data.items || [];
    allCards.push(...items);
    hasMorePages = data.hasMorePages === true;
    pageNumber++;
    if (hasMorePages) await new Promise(r => setTimeout(r, 500));
  }

  onProgress?.({
    currentPage: pageNumber - 1,
    totalFound: allCards.length,
    status: 'Concluído!',
  });

  return allCards;
}
