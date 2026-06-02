import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ClientFeatures {
  dashboard: boolean;
  pipeline: boolean;
  campanhas: boolean;
  auditoria: boolean;
  ia?: boolean;
  ao_vivo?: boolean;
  contratos?: boolean;
  evolucao?: boolean;
  comparar?: boolean;
  follow_up?: boolean;
  templates_api?: boolean;
  notificacoes?: boolean;
  supervisao?: boolean;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  helena_api_key: string;
  helena_company_id: string | null;
  active: boolean;
  created_at: string;
  features: ClientFeatures;
  client_level: number;
  allowed_numbers?: string[] | null;
}

export interface ClientPanel {
  id: string;
  client_id: string;
  panel_id: string;
  panel_name: string;
  sync_interval_minutes: number;
  created_at: string;
}

export function useClient(slug: string | undefined) {
  const [client, setClient] = useState<Client | null>(null);
  const [panels, setPanels] = useState<ClientPanel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) { setLoading(false); return; }

    async function load() {
      setLoading(true);
      // Try helena_company_id first, fallback to slug
      let { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('helena_company_id', slug)
        .eq('active', true)
        .maybeSingle();

      if (!clientData) {
        const res = await supabase
          .from('clients')
          .select('*')
          .eq('slug', slug)
          .eq('active', true)
          .maybeSingle();
        clientData = res.data;
      }

      if (clientData) {
        setClient(clientData as unknown as Client);
        const { data: panelsData } = await supabase
          .from('client_panels')
          .select('*')
          .eq('client_id', clientData.id);
        setPanels((panelsData as ClientPanel[]) || []);
      }
      setLoading(false);
    }
    load();
  }, [slug]);

  return { client, panels, loading };
}

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const loadClients = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    setClients((data as unknown as Client[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadClients(); }, []);

  return { clients, loading, reload: loadClients };
}
