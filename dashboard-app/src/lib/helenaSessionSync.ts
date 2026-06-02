import type { Session } from '@/api/helena';
import { supabase } from '@/integrations/supabase/client';

type HelenaSessionRow = {
  id: string;
  card_id: string | null;
  contact_id: string | null;
  status: string | null;
  session_created_at: string | null;
  session_closed_at: string | null;
  agent_name: string | null;
  department_name: string | null;
  channel_type: string | null;
  channel_name: string | null;
  classification: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  utm_source: string | null;
  utm_source_id: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_headline: string | null;
  utm_term: string | null;
  utm_referral_url: string | null;
  utm_clid: string | null;
  session_detail_full: any;
  synced_at: string;
};

function mapSession(row: HelenaSessionRow): Session {
  return {
    id: row.id,
    cardId: row.card_id || '',
    contactId: row.contact_id || '',
    status: row.status,
    sessionCreatedAt: row.session_created_at,
    sessionClosedAt: row.session_closed_at,
    agentName: row.agent_name,
    departmentName: row.department_name,
    channelType: row.channel_type,
    channelName: row.channel_name,
    classification: row.classification,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
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
    sessionDetailFull: row.session_detail_full,
    syncedAt: row.synced_at,
  };
}

export async function syncCardSessions(cardId: string) {
  // Chama nosso server.js local (mesma origem do dashboard, 8787)
  const response = await fetch(`/api/sync-card-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId, force: true }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'Não foi possível sincronizar o chat.');
  }

  if (payload.rateLimitHit || payload.rateLimited) {
    throw new Error('A sincronização está temporariamente limitada pela API.');
  }

  const { data, error } = await supabase
    .from('helena_sessions')
    .select('*')
    .eq('card_id', cardId)
    .order('session_created_at', { ascending: false });

  if (error) throw error;

  return {
    message: payload.message as string | undefined,
    sessions: ((data || []) as HelenaSessionRow[]).map(mapSession),
  };
}