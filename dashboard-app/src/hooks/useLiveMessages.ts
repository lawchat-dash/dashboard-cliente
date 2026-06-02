import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isResolved, subscribeResolvedAlerts } from '@/lib/resolvedAlerts';

export interface LiveMessage {
  id: string;
  client_id: string;
  company_id: string | null;
  session_id: string;
  text: string;
  direction: string;
  origin: string;
  status: string | null;
  sender_from: string | null;
  sender_to: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
}

export type SessionHealth = 'green' | 'yellow' | 'red';

export interface LiveSession {
  session_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  messages: LiveMessage[];
  last_message_at: string;
  message_count: number;
  recentActivity: number; // messages in last 5 min
  // Enriched data from helena_sessions / helena_cards
  department_name: string | null;
  agent_name: string | null;
  step_title: string | null;
  step_phase: string | null;
  channel_type: string | null;
  card_id: string | null;
  tags: string[];
  // Health status
  health: SessionHealth;
  healthReason: string | null;
  minutesSinceLastOurReply: number | null;
}

export type TimeWindow = '1h' | '3h' | '5h' | '12h' | '24h';

const WINDOW_MS: Record<TimeWindow, number> = {
  '1h': 1 * 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '5h': 5 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export function useLiveMessages(clientId?: string, timeWindow: TimeWindow = '1h') {
  const [allMessages, setAllMessages] = useState<LiveMessage[]>([]);
  const [resolvedTick, setResolvedTick] = useState(0);
  useEffect(() => subscribeResolvedAlerts(() => setResolvedTick(t => t + 1)), []);
  const [enrichmentData, setEnrichmentData] = useState<Record<string, {
    department_name: string | null;
    agent_name: string | null;
    step_title: string | null;
    step_phase: string | null;
    channel_type: string | null;
    card_id: string | null;
    tags: string[];
  }>>({});
  const [loading, setLoading] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const channelRef = useRef<any>(null);

  // Always fetch 24h of data, but page through the results because the API returns up to 1000 rows per request
  const fetchMessages = useCallback(async () => {
    if (!clientId) {
      setAllMessages([]);
      setLoading(false);
      return;
    }

    const cutoff = new Date(Date.now() - WINDOW_MS['24h']).toISOString();
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    let rows: LiveMessage[] = [];

    try {
      while (hasMore) {
        const { data, error } = await supabase
          .from('live_messages')
          .select('id, client_id, company_id, session_id, text, direction, origin, status, sender_from, sender_to, contact_name, contact_phone, created_at')
          .eq('client_id', clientId)
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;

        const page = (data as LiveMessage[]) || [];
        rows = rows.concat(page);
        hasMore = page.length === pageSize;
        from += pageSize;
      }

      rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
      setAllMessages(rows);
      setLastFetchedAt(new Date());
    } catch (error) {
      console.error('Error fetching live messages:', error);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Fetch enrichment data from helena_sessions for active session_ids
  const enrichmentRef = useRef(enrichmentData);
  enrichmentRef.current = enrichmentData;

  const fetchEnrichment = useCallback(async (sessionIds: string[]) => {
    if (sessionIds.length === 0) return;

    // Only fetch for sessions we don't already have
    const needed = sessionIds.filter(id => !enrichmentRef.current[id]);
    if (needed.length === 0) return;

    // Fetch helena_sessions data
    const { data: sessionData } = await supabase
      .from('helena_sessions')
      .select('id, department_name, agent_name, channel_type, card_id')
      .in('id', needed);

    if (!sessionData || sessionData.length === 0) return;

    // Get card_ids to fetch step info
    const cardIds = sessionData.map(s => s.card_id).filter(Boolean) as string[];
    let cardMap: Record<string, { step_title: string | null; step_phase: string | null; tags: string[] }> = {};

    if (cardIds.length > 0) {
      const { data: cardData } = await supabase
        .from('helena_cards')
        .select('id, step_title, step_phase, tags_name')
        .in('id', cardIds);

      if (cardData) {
        cardData.forEach(c => {
          const tags = Array.isArray(c.tags_name) ? (c.tags_name as string[]).map(t => String(t).trim()).filter(Boolean) : [];
          cardMap[c.id] = { step_title: c.step_title, step_phase: c.step_phase, tags };
        });
      }
    }

    const newEnrichment: typeof enrichmentData = {};
    sessionData.forEach(s => {
      const card = s.card_id ? cardMap[s.card_id] : null;
      newEnrichment[s.id] = {
        department_name: s.department_name,
        agent_name: s.agent_name,
        channel_type: s.channel_type,
        card_id: s.card_id,
        step_title: card?.step_title || null,
        step_phase: card?.step_phase || null,
        tags: card?.tags || [],
      };
    });

    setEnrichmentData(prev => ({ ...prev, ...newEnrichment }));
  }, []);

  useEffect(() => {
    fetchMessages();
    const cleanup = setInterval(fetchMessages, 2 * 60 * 1000);
    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchMessages();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleWindowFocus);

    return () => {
      clearInterval(cleanup);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleWindowFocus);
    };
  }, [fetchMessages]);

  // Realtime subscription for live_messages + session/card changes
  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`live-data-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_messages',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const newMsg = payload.new as LiveMessage;
          setAllMessages((prev) => [...prev, newMsg]);
          setLastFetchedAt(new Date());
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'helena_sessions',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row.id) {
            // Refresh enrichment for this session
            setEnrichmentData(prev => ({
              ...prev,
              [row.id]: {
                department_name: row.department_name || prev[row.id]?.department_name || null,
                agent_name: row.agent_name || prev[row.id]?.agent_name || null,
                channel_type: row.channel_type || prev[row.id]?.channel_type || null,
                card_id: row.card_id || prev[row.id]?.card_id || null,
                step_title: prev[row.id]?.step_title || null,
                step_phase: prev[row.id]?.step_phase || null,
                tags: prev[row.id]?.tags || [],
              }
            }));
            // If card_id appeared, fetch card data
            if (row.card_id && !enrichmentRef.current[row.id]?.card_id) {
              supabase
                .from('helena_cards')
                .select('step_title, step_phase, tags_name')
                .eq('id', row.card_id)
                .maybeSingle()
                .then(({ data }) => {
                  if (data) {
                    const tags = Array.isArray(data.tags_name) ? (data.tags_name as string[]).map(t => String(t).trim()).filter(Boolean) : [];
                    setEnrichmentData(prev => ({
                      ...prev,
                      [row.id]: {
                        ...prev[row.id],
                        step_title: data.step_title,
                        step_phase: data.step_phase,
                        tags,
                      }
                    }));
                  }
                });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'helena_cards',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const card = payload.new as any;
          // Update enrichment for any session linked to this card
          setEnrichmentData(prev => {
            const updated = { ...prev };
            for (const [sessionId, data] of Object.entries(updated)) {
              if (data.card_id === card.id) {
                const tags = Array.isArray(card.tags_name) ? (card.tags_name as string[]).map((t: string) => String(t).trim()).filter(Boolean) : data.tags;
                updated[sessionId] = {
                  ...data,
                  step_title: card.step_title || data.step_title,
                  step_phase: card.step_phase || data.step_phase,
                  tags,
                };
              }
            }
            return updated;
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [clientId]);

  // Filter client-side by selected timeWindow
  const cutoffMs = Date.now() - WINDOW_MS[timeWindow];
  const messages = allMessages.filter(m => new Date(m.created_at).getTime() >= cutoffMs);

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const now = Date.now();

  // Compute health for a session based on its messages
  function computeHealth(msgs: LiveMessage[]): { health: SessionHealth; healthReason: string | null; minutesSinceLastOurReply: number | null } {
    if (msgs.length === 0) return { health: 'green', healthReason: null, minutesSinceLastOurReply: null };

    const lastMsg = msgs[msgs.length - 1];
    const lastMsgTime = new Date(lastMsg.created_at).getTime();
    const minutesAgo = (now - lastMsgTime) / 60000;

    // Yellow (light): inactive for 3h+
    if (minutesAgo > 180) {
      const label = lastMsg.direction === 'FROM_HUB' ? 'Lead sem resposta' : 'Inativo';
      return { health: 'yellow', healthReason: `${label} há ${Math.floor(minutesAgo / 60)}h${Math.floor(minutesAgo % 60)}min`, minutesSinceLastOurReply: null };
    }

    // Check if last message was from the lead (FROM_HUB) and AI hasn't responded for 10min+
    if (lastMsg.direction === 'FROM_HUB' && minutesAgo > 10) {
      return { health: 'red', healthReason: `Lead sem resposta há ${Math.floor(minutesAgo)}min — possível bug`, minutesSinceLastOurReply: Math.floor(minutesAgo) };
    }

    return { health: 'green', healthReason: null, minutesSinceLastOurReply: null };
  }

  // Group by session
  const sessions: LiveSession[] = Object.values(
    messages.reduce((acc, msg) => {
      if (!acc[msg.session_id]) {
        const enriched = enrichmentData[msg.session_id];
        acc[msg.session_id] = {
          session_id: msg.session_id,
          contact_name: msg.contact_name,
          contact_phone: msg.contact_phone,
          messages: [],
          last_message_at: msg.created_at,
          message_count: 0,
          recentActivity: 0,
          department_name: enriched?.department_name || null,
          agent_name: enriched?.agent_name || null,
          step_title: enriched?.step_title || null,
          step_phase: enriched?.step_phase || null,
          channel_type: enriched?.channel_type || null,
          card_id: enriched?.card_id || null,
          tags: enriched?.tags || [],
          health: 'green',
          healthReason: null,
          minutesSinceLastOurReply: null,
        };
      }
      acc[msg.session_id].messages.push(msg);
      acc[msg.session_id].message_count++;
      if (new Date(msg.created_at).getTime() > fiveMinAgo) {
        acc[msg.session_id].recentActivity++;
      }
      if (msg.created_at > acc[msg.session_id].last_message_at) {
        acc[msg.session_id].last_message_at = msg.created_at;
        acc[msg.session_id].contact_name = msg.contact_name || acc[msg.session_id].contact_name;
        acc[msg.session_id].contact_phone = msg.contact_phone || acc[msg.session_id].contact_phone;
      }
      return acc;
    }, {} as Record<string, LiveSession>)
  ).map(session => {
    // Compute health after all messages are grouped
    let { health, healthReason, minutesSinceLastOurReply } = computeHealth(session.messages);
    // If user manually resolved this alert and no newer message has arrived, force green
    if (health !== 'green' && isResolved(session.session_id, session.last_message_at)) {
      health = 'green';
      healthReason = null;
      minutesSinceLastOurReply = null;
    }
    return { ...session, health, healthReason, minutesSinceLastOurReply };
  }).sort((a, b) => {
    // Sort: red first, then yellow, then by recency
    const healthOrder: Record<SessionHealth, number> = { red: 0, yellow: 1, green: 2 };
    const hDiff = healthOrder[a.health] - healthOrder[b.health];
    if (hDiff !== 0) return hDiff;
    return b.last_message_at.localeCompare(a.last_message_at);
  });

  // Trigger enrichment for new session_ids
  useEffect(() => {
    const sessionIds = sessions.map(s => s.session_id);
    if (sessionIds.length > 0) {
      fetchEnrichment(sessionIds);
    }
  }, [sessions.map(s => s.session_id).join(',')]);

  const hasActiveMessages = messages.length > 0;

  return { messages, sessions, loading, hasActiveMessages, refetch: fetchMessages, lastFetchedAt };
}
