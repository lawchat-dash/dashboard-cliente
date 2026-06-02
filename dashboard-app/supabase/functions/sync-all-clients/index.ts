import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let targetClientId: string | null = null;
    let syncMode: string = 'incremental';
    try {
      const body = await req.json();
      targetClientId = body.clientId || null;
      if (body.mode) syncMode = body.mode;
    } catch { /* no body */ }

    // Fetch active clients
    let query = supabase.from('clients').select('id, name, slug').eq('active', true);
    if (targetClientId) {
      query = query.eq('id', targetClientId);
    }
    const { data: clients, error: clientsErr } = await query;
    if (clientsErr) throw clientsErr;
    if (!clients || clients.length === 0) {
      return new Response(JSON.stringify({ message: 'No active clients found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const client of clients) {
      console.log(`Syncing client: ${client.name} (${client.id})`);
      try {
        // Fetch panels for this client
        const { data: panels } = await supabase
          .from('client_panels')
          .select('panel_id, panel_name, sync_interval_minutes')
          .eq('client_id', client.id);

        const panelResults: any[] = [];

        if (panels && panels.length > 0) {
          for (const panel of panels) {
            // Check if this panel is due for sync
            const intervalMinutes = panel.sync_interval_minutes || 10;
            if (intervalMinutes > 10) {
              const { data: lastCard } = await supabase
                .from('helena_cards')
                .select('synced_at')
                .eq('client_id', client.id)
                .eq('panel_id', panel.panel_id)
                .order('synced_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (lastCard?.synced_at) {
                const lastSync = new Date(lastCard.synced_at).getTime();
                const now = Date.now();
                const elapsedMinutes = (now - lastSync) / 60000;
                if (elapsedMinutes < intervalMinutes * 0.9) {
                  console.log(`  Skipping panel: ${panel.panel_name} - last synced ${Math.round(elapsedMinutes)}min ago`);
                  panelResults.push({ panelId: panel.panel_id, panelName: panel.panel_name, skipped: true });
                  continue;
                }
              }
            }

            console.log(`  Syncing panel: ${panel.panel_name} for ${client.name}`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 280000);

            let panelData: any = { skipped: true };
            try {
              const res = await fetch(`${supabaseUrl}/functions/v1/sync-helena`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${supabaseAnonKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  clientId: client.id,
                  panelId: panel.panel_id,
                  mode: syncMode,
                  fetchNotes: true, // Enable contract notes fetching
                }),
                signal: controller.signal,
              });
              clearTimeout(timeout);
              const rawText = await res.text();
              try {
                panelData = JSON.parse(rawText);
              } catch {
                panelData = { error: 'Invalid JSON response', length: rawText.length };
              }

              // If sync-helena reported rate limit, skip remaining panels for this client
              if (panelData.rateLimited) {
                console.warn(`  ⏸ Rate limited on panel ${panel.panel_name}. Skipping remaining panels.`);
                panelResults.push({ panelId: panel.panel_id, panelName: panel.panel_name, ...panelData });
                break;
              }
            } catch (fetchErr) {
              clearTimeout(timeout);
              console.warn(`sync-helena error for ${client.name}/${panel.panel_name}:`, fetchErr.message);
              panelData = { error: fetchErr.message };
            }
            panelResults.push({ panelId: panel.panel_id, panelName: panel.panel_name, ...panelData });

            // Delay between panels to spread requests
            if (panels.length > 1) {
              await delay(5000);
            }
          }
        } else {
          // No panels configured, legacy fallback
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 280000);
          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/sync-helena`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ clientId: client.id, mode: syncMode, fetchNotes: true }),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            const rawText = await res.text();
            try { panelResults.push(JSON.parse(rawText)); } catch { panelResults.push({ error: 'Invalid JSON' }); }
          } catch (fetchErr) {
            clearTimeout(timeout);
            panelResults.push({ error: fetchErr.message });
          }
        }

        // Check if any panel was rate limited - if so, skip sessions
        const wasRateLimited = panelResults.some((p: any) => p.rateLimited);

        // Trigger sync-sessions ONLY if cards sync was not rate limited
        let sessionsData: any = { skipped: true };
        if (!wasRateLimited) {
          // Wait before starting sessions to let rate limit window recover
          await delay(5000);

          try {
            const sessionsRes = await fetch(`${supabaseUrl}/functions/v1/sync-sessions`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ clientId: client.id }),
            });
            const sessionsText = await sessionsRes.text();
            try { sessionsData = JSON.parse(sessionsText); } catch { sessionsData = { error: 'Invalid JSON' }; }
          } catch (sessErr) {
            console.warn(`sync-sessions error for ${client.name}:`, sessErr.message);
            sessionsData = { error: sessErr.message };
          }
        } else {
          console.warn(`  ⏸ Skipping sessions sync for ${client.name} due to rate limit.`);
          sessionsData = { skipped: true, reason: 'rate_limited' };
        }

        results.push({
          clientId: client.id,
          clientName: client.name,
          panels: panelResults,
          sessions: sessionsData,
        });
      } catch (err) {
        console.error(`Error syncing client ${client.name}:`, err);
        results.push({ clientId: client.id, clientName: client.name, error: err.message });
      }

      // Delay between clients
      if (clients.length > 1) {
        await delay(10000);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('sync-all-clients error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
