import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface HelenaAgent {
  id: string;
  client_id: string;
  helena_user_id: string;
  name: string;
  email: string | null;
  profile: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

interface CurrentUser {
  helenaUserId: string | null;
  accountId: string | null;
  agent: HelenaAgent | null;
  loading: boolean;
}

const STORAGE_KEY = 'current-helena-user';

export function useCurrentUser(clientId?: string): CurrentUser {
  const [searchParams] = useSearchParams();
  const [agent, setAgent] = useState<HelenaAgent | null>(null);
  const [loading, setLoading] = useState(true);

  // Capture query params on first load and persist
  const helenaUserId = useMemo(() => {
    const fromUrl = searchParams.get('id_do_usuario');
    if (fromUrl) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ helenaUserId: fromUrl, accountId: searchParams.get('id_da_conta') }));
      return fromUrl;
    }
    // Fallback to localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).helenaUserId || null;
    } catch {}
    return null;
  }, [searchParams]);

  const accountId = useMemo(() => {
    const fromUrl = searchParams.get('id_da_conta');
    if (fromUrl) return fromUrl;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).accountId || null;
    } catch {}
    return null;
  }, [searchParams]);

  useEffect(() => {
    if (!helenaUserId || !clientId) {
      setLoading(false);
      return;
    }

    const fetchAgent = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('helena_agents')
        .select('*')
        .eq('client_id', clientId)
        .eq('helena_user_id', helenaUserId)
        .maybeSingle();

      if (data) {
        setAgent(data as HelenaAgent);
      } else {
        // Agent not found — trigger sync to discover new agents
        try {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          await fetch(`https://${projectId}.supabase.co/functions/v1/sync-helena-agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId }),
          });
          // Retry fetch after sync
          const { data: retryData } = await supabase
            .from('helena_agents')
            .select('*')
            .eq('client_id', clientId)
            .eq('helena_user_id', helenaUserId)
            .maybeSingle();
          if (retryData) setAgent(retryData as HelenaAgent);
        } catch (e) {
          console.error('Failed to sync agents:', e);
        }
      }
      setLoading(false);
    };

    fetchAgent();
  }, [helenaUserId, clientId]);

  return { helenaUserId, accountId, agent, loading };
}
