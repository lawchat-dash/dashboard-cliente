import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LEGACY_API_KEY = 'pn_qETvmJFrfT0O6dyIJNyZCg2Gb93qTtwEUeKiz5OZY';
const CHAT_V1_URL = 'https://api.helena.run/chat/v1';
const CHAT_V2_URL = 'https://api.helena.run/chat/v2';

// REDUCED: process fewer cards per batch to stay within rate limits
const BATCH_SIZE = 20;
// REDUCED: less parallel requests to avoid bursts
const PARALLEL_SESSIONS = 3;
// REDUCED: fewer chains per invocation
const MAX_CHAINS = 10;
const DELAY_BETWEEN_REQUESTS_MS = 2000;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// Simple hash for API key
async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
      return { allowed: true, remaining: 999 };
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

async function fetchWithRetry(
  url: string, headers: Record<string, string>, apiKeyHash: string, clientId: string | null, supabase: any, retries = 3
): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 429) {
          await lockAfter429(supabase, apiKeyHash);
          throw new Error('RATE_LIMITED');
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (err.message === 'RATE_LIMITED') throw err;
      if (i === retries - 1) throw err;
      await delay(1000 * (i + 1));
    }
  }
}

async function processSessionsInChunks(
  sessions: any[], cardId: string, contactId: string, clientId: string | null, clientName: string | null,
  supabase: any, now: string, apiHeaders: Record<string, string>, apiKeyHash: string
): Promise<{ synced: number; rateLimited: boolean }> {
  let synced = 0;

  for (let i = 0; i < sessions.length; i += PARALLEL_SESSIONS) {
    // Check rate limit before each chunk
    const chunkSize = Math.min(PARALLEL_SESSIONS, sessions.length - i);
    const rl = await checkRateLimit(supabase, apiKeyHash, clientId, chunkSize);
    if (!rl.allowed) {
      console.warn(`⏸ Rate limit hit during session sync. Synced ${synced} so far.`);
      return { synced, rateLimited: true };
    }

    const chunk = sessions.slice(i, i + PARALLEL_SESSIONS);
    const results = await Promise.allSettled(
      chunk.map(async (session: any) => {
        try {
          const detail = await fetchWithRetry(
            `${CHAT_V2_URL}/session/${session.id}?includeDetails=AgentDetails&includeDetails=DepartmentsDetails&includeDetails=ContactDetails&includeDetails=ChannelTypeDetails&includeDetails=ClassificationDetails&includeDetails=ChannelDetails`,
            apiHeaders, apiKeyHash, clientId, supabase
          );

          const utm = detail.utm || {};
          const row = {
            id: session.id,
            card_id: cardId,
            contact_id: contactId,
            client_id: clientId,
            client_name: clientName || null,
            status: detail.status || null,
            session_created_at: detail.createdAt || null,
            session_closed_at: detail.closedAt || null,
            agent_name: detail.agentDetails?.name || detail.agent?.name || null,
            department_name: detail.departmentDetails?.name || detail.departmentsDetails?.[0]?.name || null,
            channel_type: detail.channelType || null,
            channel_name: detail.channelDetails?.displayName || detail.channelDetails?.name || null,
            classification: detail.classification?.name || detail.classificationDetails?.name || null,
            contact_name: detail.contactDetails?.name || null,
            contact_phone: detail.contactDetails?.phonenumberFormatted || detail.contactDetails?.phonenumber || null,
            contact_email: detail.contactDetails?.email || null,
            utm_source: utm.source || null,
            utm_source_id: utm.sourceId || null,
            utm_medium: utm.medium || null,
            utm_campaign: utm.campaign || null,
            utm_content: utm.content || null,
            utm_headline: utm.headline || null,
            utm_term: utm.term || null,
            utm_referral_url: utm.referralUrl || null,
            utm_clid: utm.clid || null,
            session_detail_full: detail,
            synced_at: now,
          };

          const { error: upsertError } = await supabase.from('helena_sessions').upsert(row, { onConflict: 'id' });
          if (upsertError) {
            console.error(`Upsert error for session ${session.id}:`, upsertError);
            return false;
          }
          return true;
        } catch (err) {
          if (err.message === 'RATE_LIMITED') throw err;
          console.warn(`Session ${session.id} failed:`, err.message);
          return false;
        }
      })
    );

    let hasRateLimitError = false;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) synced++;
      if (r.status === 'rejected' && r.reason?.message === 'RATE_LIMITED') hasRateLimitError = true;
    }

    if (hasRateLimitError) {
      return { synced, rateLimited: true };
    }

    // Delay between chunks
    if (i + PARALLEL_SESSIONS < sessions.length) {
      await delay(DELAY_BETWEEN_REQUESTS_MS);
    }
  }
  return { synced, rateLimited: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let chainCount = 0;
    let panelIds: string[] | null = null;
    let clientId: string | null = null;
    let clientName: string | null = null;
    let apiKey = LEGACY_API_KEY;
    let singleCardId: string | null = null;
    let force = false;

    try {
      const body = await req.json();
      chainCount = body?.chainCount || 0;
      panelIds = body?.panelIds || null;
      clientId = body?.clientId || null;
      singleCardId = body?.cardId || null;
      force = body?.force === true;

      // If a specific card is requested, derive client from the card itself
      if (singleCardId && !clientId) {
        const { data: card } = await supabase
          .from('helena_cards')
          .select('client_id')
          .eq('id', singleCardId)
          .single();
        if (card?.client_id) clientId = card.client_id;
      }

      if (clientId) {
        const { data: client } = await supabase.from('clients').select('helena_api_key, name').eq('id', clientId).single();
        if (client) {
          apiKey = client.helena_api_key;
          clientName = client.name;
        }
      }
    } catch { /* no body */ }

    const apiKeyHash = await hashKey(apiKey);

    // Check if this API key is currently locked/limited
    const initialCheck = await checkRateLimit(supabase, apiKeyHash, clientId, 0);
    if (!initialCheck.allowed) {
      const waitSec = Math.ceil(initialCheck.waitSeconds || 60);
      console.warn(`⏸ API key rate-limited. Skipping sync-sessions. Wait ${waitSec}s.`);
      return new Response(
        JSON.stringify({ success: false, rateLimited: true, waitSeconds: waitSec, chainCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiHeaders = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };

    let query = supabase
      .from('helena_cards')
      .select('id, contact_ids, client_id')
      .order('created_at', { ascending: false })
      .limit(singleCardId ? 1 : BATCH_SIZE);

    if (singleCardId) {
      query = query.eq('id', singleCardId);
    } else {
      query = query.eq('sessions_synced', false);
    }
    if (clientId && !singleCardId) query = query.eq('client_id', clientId);
    if (panelIds && panelIds.length > 0) query = query.in('panel_id', panelIds);

    const { data: cards, error: cardsError } = await query;
    if (cardsError) throw cardsError;

    if (!cards || cards.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'All cards already synced', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();
    let totalSessions = 0;
    let processedCards = 0;
    let rateLimitHit = false;

    for (const card of cards) {
      if (rateLimitHit) break;

      const contactIds = card.contact_ids as string[] | null;
      if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
        await supabase.from('helena_cards').update({ sessions_synced: true }).eq('id', card.id);
        processedCards++;
        continue;
      }

      const contactId = contactIds[0];
      const cardClientId = card.client_id || clientId;

      try {
        // Check rate limit before fetching sessions list
        const rl = await checkRateLimit(supabase, apiKeyHash, clientId);
        if (!rl.allowed) {
          console.warn(`⏸ Rate limit hit. Stopping at card ${processedCards}.`);
          rateLimitHit = true;
          break;
        }

        const sessionsData = await fetchWithRetry(
          `${CHAT_V1_URL}/session?ContactId=${contactId}`,
          apiHeaders, apiKeyHash, clientId, supabase
        );
        const sessions = sessionsData?.items || sessionsData || [];
        if (!Array.isArray(sessions) || sessions.length === 0) {
          await supabase.from('helena_cards').update({ sessions_synced: true }).eq('id', card.id);
          processedCards++;
          continue;
        }

        const result = await processSessionsInChunks(sessions, card.id, contactId, cardClientId, clientName, supabase, now, apiHeaders, apiKeyHash);
        totalSessions += result.synced;

        if (result.rateLimited) {
          rateLimitHit = true;
          // Don't mark as synced so it retries next time
          break;
        }

        await supabase.from('helena_cards').update({ sessions_synced: true }).eq('id', card.id);
      } catch (err) {
        if (err.message === 'RATE_LIMITED') {
          rateLimitHit = true;
          break;
        }
        console.error(`Failed to fetch sessions for contact ${contactId}:`, err);
        await supabase.from('helena_cards').update({ sessions_synced: true }).eq('id', card.id);
      }

      processedCards++;
      await delay(DELAY_BETWEEN_REQUESTS_MS);
    }

    console.log(`Chain ${chainCount}: Processed ${processedCards} cards, synced ${totalSessions} sessions.${rateLimitHit ? ' (rate limit hit)' : ''}`);

    // Chain only if not rate limited and there are more cards
    let chained = false;
    if (!singleCardId && !rateLimitHit && cards.length === BATCH_SIZE && chainCount < MAX_CHAINS) {
      try {
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        fetch(`${supabaseUrl}/functions/v1/sync-sessions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ chainCount: chainCount + 1, panelIds, clientId }),
        }).catch(e => console.error('Self-chain error:', e));
        chained = true;
      } catch (e) {
        console.error('Self-chain failed:', e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processedCards, totalSessions, chainCount, chained, rateLimitHit, syncedAt: now }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sync sessions error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
