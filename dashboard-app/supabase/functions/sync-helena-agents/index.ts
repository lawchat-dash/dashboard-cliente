import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HELENA_CORE_URL = 'https://api.helena.run/core/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get clientId from body or sync all active clients
    const body = await req.json().catch(() => ({}));
    const targetClientId = body.clientId;

    // Fetch clients
    let clientsQuery = supabase.from('clients').select('id, helena_api_key, helena_company_id').eq('active', true);
    if (targetClientId) {
      clientsQuery = clientsQuery.eq('id', targetClientId);
    }
    const { data: clients, error: clientsError } = await clientsQuery;
    if (clientsError) throw clientsError;
    if (!clients || clients.length === 0) {
      return new Response(JSON.stringify({ message: 'No clients found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: { clientId: string; synced: number; error?: string }[] = [];

    for (const client of clients) {
      try {
        // Fetch agents from Helena Core API
        const response = await fetch(`${HELENA_CORE_URL}/agent`, {
          headers: {
            'Authorization': `Bearer ${client.helena_api_key}`,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          results.push({ clientId: client.id, synced: 0, error: `HTTP ${response.status}` });
          continue;
        }

        const agentsData = await response.json();
        const agents = Array.isArray(agentsData) ? agentsData : (agentsData.data || agentsData.results || []);

        let synced = 0;
        for (const agent of agents) {
          const userId = agent.userId || agent.id || agent._id;
          if (!userId) continue;

          const { error: upsertError } = await supabase
            .from('helena_agents')
            .upsert({
              client_id: client.id,
              helena_user_id: String(userId),
              name: agent.name || agent.fullName || 'Sem nome',
              email: agent.email || null,
              profile: agent.profile || agent.role || null,
              avatar_url: agent.avatarUrl || agent.avatar || null,
              is_active: agent.isActive !== false,
              raw_data: agent,
              synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'client_id,helena_user_id' });

          if (!upsertError) synced++;
        }

        results.push({ clientId: client.id, synced });
      } catch (e) {
        results.push({ clientId: client.id, synced: 0, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
