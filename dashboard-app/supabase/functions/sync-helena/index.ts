import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LEGACY_API_KEY = 'pn_qETvmJFrfT0O6dyIJNyZCg2Gb93qTtwEUeKiz5OZY';
const LEGACY_PANELS: Record<string, string> = {
  'e6e830ea-b37a-4243-b656-eba8fa8ad4cd': '🧠 CRM Comercial - IA',
  'e5c9b5ab-083f-455f-84a4-0eecb6d94d8e': 'CRM Sousa & Costa (Nº8892)',
  '6466d536-d8d1-40b3-9769-ef68a59713f7': 'CRM Sousa & Costa (Nº6225)',
};

const BASE_URL = 'https://api.helena.run/crm/v1';
const DELAY_BETWEEN_REQUESTS_MS = 2000;

// Simple hash for API key (used as identifier, not security)
async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// Check rate limit before making requests
async function checkRateLimit(supabase: any, apiKeyHash: string, clientId: string | null, count: number = 1): Promise<{ allowed: boolean; waitSeconds?: number; remaining?: number }> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_api_key_hash: apiKeyHash,
      p_client_id: clientId,
      p_increment: count,
    });
    if (error) {
      console.warn('Rate limit check error:', error.message);
      return { allowed: true, remaining: 999 }; // fail-open
    }
    return { allowed: data.allowed, waitSeconds: data.wait_seconds, remaining: data.remaining };
  } catch (err) {
    console.warn('Rate limit check failed:', err.message);
    return { allowed: true, remaining: 999 };
  }
}

// Lock rate limit after 429
async function lockAfter429(supabase: any, apiKeyHash: string) {
  try {
    await supabase.rpc('lock_rate_limit', { p_api_key_hash: apiKeyHash, p_lock_seconds: 300 });
    console.warn(`🔒 API key locked for 5 minutes after 429`);
  } catch (err) {
    console.warn('Lock rate limit failed:', err.message);
  }
}

// Rate-limited fetch with retry
async function rateLimitedFetch(
  url: string, apiKey: string, apiKeyHash: string, clientId: string | null, supabase: any
): Promise<Response | null> {
  // Check rate limit first
  const rl = await checkRateLimit(supabase, apiKeyHash, clientId);
  if (!rl.allowed) {
    const waitSec = Math.ceil(rl.waitSeconds || 60);
    console.warn(`⏸ Rate limited. Waiting ${waitSec}s...`);
    if (waitSec > 120) return null; // too long, abort
    await delay(waitSec * 1000);
    // Re-check
    const rl2 = await checkRateLimit(supabase, apiKeyHash, clientId);
    if (!rl2.allowed) return null;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      });

      if (response.ok) return response;

      if (response.status === 429) {
        console.warn(`429 received! Locking API key and aborting.`);
        await lockAfter429(supabase, apiKeyHash);
        return null; // abort entirely
      }

      console.warn(`Attempt ${attempt + 1} failed: HTTP ${response.status}`);
      await delay(Math.min(3000 * Math.pow(2, attempt), 30000));
    } catch (err) {
      console.warn(`Attempt ${attempt + 1} fetch error: ${err.message}`);
      await delay(2000 * (attempt + 1));
    }
  }
  return null;
}

// Parse contract annotation text into structured fields
function parseContractNote(text: string): Record<string, string> | null {
  if (!text || !text.includes('📄Contrato Assinado!')) return null;
  const parsed: Record<string, string> = {};
  const casoMatch = text.match(/📂\s*Caso:\s*(.+?)(?:\n\n|\n📄|$)/s);
  if (casoMatch) parsed.caso = casoMatch[1].trim();
  const resumoMatch = text.match(/📄\s*Resumo do caso:\s*(.+?)(?:\n\n📊|$)/s);
  if (resumoMatch) parsed.resumo_caso = resumoMatch[1].trim();
  const qualidadeMatch = text.match(/📊\s*Qualidade do contrato:\s*(.+?)(?:\n\n💰|$)/s);
  if (qualidadeMatch) {
    const full = qualidadeMatch[1].trim();
    parsed.qualidade_detalhe = full;
    const levelMatch = full.match(/^(Alta|Média|Baixa)/i);
    if (levelMatch) parsed.qualidade = levelMatch[1];
  }
  const retornoMatch = text.match(/💰\s*Potencial retorno:\s*(.+?)$/s);
  if (retornoMatch) parsed.potencial_retorno = retornoMatch[1].trim();
  return parsed;
}

// Fetch contract notes with rate limiting
const MAX_NOTES_PER_RUN = 10;

async function fetchContractNotes(
  supabase: any, apiKey: string, apiKeyHash: string, clientId: string, stepMappings: Map<string, string>
) {
  let query = supabase
    .from('helena_cards')
    .select('id, step_id, step_title, contract_note')
    .eq('client_id', clientId)
    .eq('archived', false)
    .is('contract_note', null);

  const { data: candidates, error } = await query;
  if (error || !candidates || candidates.length === 0) return { fetched: 0, remaining: 0 };

  const contractCards = candidates.filter((card: any) => {
    if (stepMappings.has(card.step_id)) {
      return stepMappings.get(card.step_id) === 'CONTRATO FECHADO';
    }
    const normalized = (card.step_title || '').replace(/[\u{1F300}-\u{1FFFF}]/gu, '').replace(/[^a-zA-Z0-9À-ÿ\s]/g, '').trim().toUpperCase();
    return normalized.includes('CONTRATO FECHADO') || normalized.includes('CONTRATO ASSINADO');
  });

  if (contractCards.length === 0) return { fetched: 0, remaining: 0 };

  const batch = contractCards.slice(0, MAX_NOTES_PER_RUN);
  const remaining = contractCards.length - batch.length;
  console.log(`Contract notes: processing ${batch.length} of ${contractCards.length} (${remaining} remaining)`);

  let fetched = 0;
  for (const card of batch) {
    // Check rate limit before each request
    const rl = await checkRateLimit(supabase, apiKeyHash, clientId);
    if (!rl.allowed) {
      console.warn(`⏸ Rate limit hit during contract notes. Stopping. ${remaining + batch.length - fetched} remaining.`);
      break;
    }

    try {
      const noteRes = await fetch(`${BASE_URL}/panel/card/${card.id}/note`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      });

      if (noteRes.status === 429) {
        await lockAfter429(supabase, apiKeyHash);
        break;
      }

      if (!noteRes.ok) {
        console.warn(`Failed to fetch notes for card ${card.id}: ${noteRes.status}`);
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        continue;
      }

      const noteData = await noteRes.json();
      const items = noteData.items || [];
      const contractItem = items.find((item: any) => item.text && item.text.includes('📄Contrato Assinado!'));

      if (contractItem) {
        const parsed = parseContractNote(contractItem.text);
        await supabase.from('helena_cards').update({ contract_note: contractItem, contract_parsed: parsed }).eq('id', card.id);
        fetched++;
      } else {
        await supabase.from('helena_cards').update({ contract_note: { checked: true, found: false } }).eq('id', card.id);
      }

      await delay(DELAY_BETWEEN_REQUESTS_MS);
    } catch (err) {
      console.warn(`Error fetching note for card ${card.id}:`, err.message);
    }
  }

  return { fetched, remaining };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let clientId: string | null = null;
    let apiKey: string = LEGACY_API_KEY;
    let targetPanels: { id: string; name: string }[] = [];
    let syncMode: 'full' | 'incremental' = 'full';
    let fetchNotes = false;

    try {
      const body = await req.json();
      syncMode = body.mode === 'incremental' ? 'incremental' : 'full';
      fetchNotes = body.fetchNotes === true;

      if (body.clientId) {
        clientId = body.clientId;
        const { data: client } = await supabase.from('clients').select('helena_api_key, name').eq('id', clientId).single();
        if (!client) throw new Error('Client not found');
        apiKey = client.helena_api_key;
        var clientName: string | null = client.name;

        const { data: panels } = await supabase.from('client_panels').select('panel_id, panel_name').eq('client_id', clientId);
        if (body.panelId) {
          const match = (panels || []).find((p: any) => p.panel_id === body.panelId);
          targetPanels = match ? [{ id: match.panel_id, name: match.panel_name }] : [];
        } else {
          targetPanels = (panels || []).map((p: any) => ({ id: p.panel_id, name: p.panel_name }));
        }
      } else {
        if (body.panelId && LEGACY_PANELS[body.panelId]) {
          targetPanels = [{ id: body.panelId, name: LEGACY_PANELS[body.panelId] }];
        } else {
          targetPanels = Object.entries(LEGACY_PANELS).map(([id, name]) => ({ id, name }));
        }
      }
    } catch {
      targetPanels = [{ id: 'e6e830ea-b37a-4243-b656-eba8fa8ad4cd', name: '🧠 CRM Comercial - IA' }];
    }

    const apiKeyHash = await hashKey(apiKey);

    // Check if this API key is currently locked
    const initialCheck = await checkRateLimit(supabase, apiKeyHash, clientId, 0);
    if (!initialCheck.allowed) {
      const waitSec = Math.ceil(initialCheck.waitSeconds || 60);
      console.warn(`⏸ API key is rate-limited. Wait ${waitSec}s. Skipping sync.`);
      return new Response(
        JSON.stringify({ success: false, rateLimited: true, waitSeconds: waitSec }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For incremental mode, get the last synced_at
    let lastSyncedAt: string | null = null;
    if (syncMode === 'incremental' && clientId) {
      const { data: latestCard } = await supabase.from('helena_cards').select('synced_at').eq('client_id', clientId).order('synced_at', { ascending: false }).limit(1).single();
      lastSyncedAt = latestCard?.synced_at || null;
    }

    if (targetPanels.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No panels found for this client' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isSinglePanel = targetPanels.length === 1;
    const allCards: any[] = [];
    let rateLimitHit = false;

    for (const panel of targetPanels) {
      if (rateLimitHit) break;

      let pageNumber = 1;
      const pageSize = 100;
      let hasMorePages = true;

      console.log(`[${syncMode}] Fetching panel: ${panel.name} (${panel.id})`);

      while (hasMorePages) {
        const apiUrl = `${BASE_URL}/panel/card?PanelId=${panel.id}&PageSize=${pageSize}&PageNumber=${pageNumber}&IncludeDetails=StepTitle&IncludeDetails=StepPhase&IncludeDetails=PanelTitle&IncludeDetails=ResponsibleUser&IncludeDetails=CustomFields&IncludeDetails=Contacts`;

        const response = await rateLimitedFetch(apiUrl, apiKey, apiKeyHash, clientId, supabase);

        if (!response) {
          console.warn(`Panel ${panel.name} aborted on page ${pageNumber} (rate limit or error)`);
          rateLimitHit = true;
          break;
        }

        const data = await response.json();
        const items = data.items || [];
        allCards.push(...items);
        hasMorePages = data.hasMorePages === true;
        pageNumber++;

        if (hasMorePages) await delay(DELAY_BETWEEN_REQUESTS_MS);
      }

      console.log(`Panel ${panel.name}: ${allCards.length} cards total so far`);
      if (!isSinglePanel && !rateLimitHit) await delay(3000);
    }

    console.log(`Fetched ${allCards.length} cards from ${targetPanels.length} panel(s)${rateLimitHit ? ' (rate limit hit)' : ''}`);

    const now = new Date().toISOString();

    // Fetch IDs of cards that already have sessions_synced = true
    const { data: syncedRows } = await supabase.from('helena_cards').select('id').eq('sessions_synced', true);
    const syncedIds = new Set((syncedRows || []).map((r: any) => r.id));

    // In incremental mode, only upsert new/updated cards
    let cardsToUpsert = allCards;
    if (syncMode === 'incremental' && lastSyncedAt) {
      const { data: existingCards } = await supabase.from('helena_cards').select('id, updated_at').eq('client_id', clientId);
      const existingMap = new Map((existingCards || []).map((c: any) => [c.id, c.updated_at]));
      cardsToUpsert = allCards.filter((card: any) => {
        const existing = existingMap.get(card.id);
        return !existing || card.updatedAt > existing;
      });
      console.log(`[incremental] ${cardsToUpsert.length} new/updated out of ${allCards.length} total`);
    }

    const rows = cardsToUpsert.map((card: any) => ({
      id: card.id,
      created_at: card.createdAt,
      updated_at: card.updatedAt,
      archived: card.archived ?? false,
      panel_id: card.panelId,
      panel_title: card.panelTitle,
      step_id: card.stepId,
      step_title: card.stepTitle,
      step_phase: card.stepPhase,
      title: card.title,
      key: card.key,
      number: card.number,
      due_date: card.dueDate,
      is_overdue: card.isOverdue ?? false,
      tag_ids: card.tagIds || [],
      monetary_amount: card.monetaryAmount,
      responsible_user: card.responsibleUser,
      contact_ids: card.contactIds || [],
      contacts: card.contacts || [],
      custom_fields: card.customFields || {},
      metadata: card.metadata,
      position: card.position,
      description: card.description,
      company_id: card.companyId,
      responsible_user_id: card.responsibleUserId,
      session_id: card.sessionId,
      sessions_synced: syncedIds.has(card.id),
      client_id: clientId,
      client_name: clientId ? (clientName ?? null) : null,
      synced_at: now,
    }));

    // Upsert in batches of 50
    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase.from('helena_cards').upsert(batch, { onConflict: 'id' });
      if (error) {
        console.error(`Upsert batch error:`, error);
        throw error;
      }
    }

    // Contract notes - only if requested and rate limit allows
    let contractNotesResult = { fetched: 0, remaining: 0 };
    if (fetchNotes && clientId) {
      const { data: stepMappingsData } = await supabase.from('client_step_mappings').select('step_id, funnel_stage').eq('client_id', clientId);
      const stepMappings = new Map((stepMappingsData || []).map((m: any) => [m.step_id, m.funnel_stage]));
      contractNotesResult = await fetchContractNotes(supabase, apiKey, apiKeyHash, clientId, stepMappings);
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalFetched: allCards.length,
        upserted: cardsToUpsert.length,
        panels: targetPanels.length,
        clientId,
        syncedAt: now,
        mode: syncMode,
        rateLimitHit,
        contractNotesFetched: contractNotesResult.fetched,
        contractNotesRemaining: contractNotesResult.remaining,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
