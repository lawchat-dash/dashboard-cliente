import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Cache de resolução de client_id
  const clientCache = new Map<string, string>();
  async function resolveClientId(rawId: string): Promise<string> {
    if (clientCache.has(rawId)) return clientCache.get(rawId)!;
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('helena_company_id', rawId)
      .maybeSingle();
    const resolved = data ? data.id : rawId;
    clientCache.set(rawId, resolved);
    return resolved;
  }

  try {
    // ─── GET: Agrega eventos em tempo real para o dashboard ───
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const clientId = url.searchParams.get('client_id') || req.headers.get('x-client-id') || undefined;
      const periodoDias = parseInt(url.searchParams.get('periodo_dias') || '7', 10);

      if (!clientId) {
        return new Response(JSON.stringify({ error: 'client_id is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const resolvedClientId = await resolveClientId(clientId);

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - periodoDias);

      const { data: events, error: eventsError } = await supabase
        .from('ai_followup_events')
        .select('id,contact_name,user_number,contact_phone,card_id,status,channel,sent_at,responded_at,department,agente,cadence_name,cadence_step,template_name,template_status,template_error,template_content,message_preview,lead_advanced,lead_closed_contract,response_time_seconds,notes,next_action_date,next_action_type,created_at')
        .eq('client_id', resolvedClientId)
        .gte('created_at', dateFrom.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);

      if (eventsError) throw eventsError;

      if (!events || events.length === 0) {
        return new Response(JSON.stringify({ ok: true, snapshot: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ─── Agregar eventos ───
      const now = new Date();
      // Use Brazil timezone (UTC-3) for "hoje" calculations
      const brNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const todayStart = new Date(brNow.getFullYear(), brNow.getMonth(), brNow.getDate());
      // Offset: todayStart is in local terms, convert back to UTC for comparison
      const brOffsetMs = now.getTime() - brNow.getTime();
      const todayStartUtc = new Date(todayStart.getTime() + brOffsetMs);
      const tomorrowStartUtc = new Date(todayStartUtc.getTime() + 86400000);
      const tomorrowEndUtc = new Date(tomorrowStartUtc.getTime() + 86400000);

      const todayEvents = events.filter(e => new Date(e.created_at) >= todayStartUtc);
      const respondedEvents = events.filter(e => e.responded_at != null);
      const advancedEvents = events.filter(e => e.lead_advanced === true);
      const contractEvents = events.filter(e => e.lead_closed_contract === true);

      const uniqueLeads = new Set(events.map(e => e.user_number || e.contact_phone || e.card_id).filter(Boolean));
      const mediaPerLead = uniqueLeads.size > 0 ? +(events.length / uniqueLeads.size).toFixed(1) : 0;

      const responseTimes = events.filter(e => e.response_time_seconds && e.response_time_seconds > 0).map(e => e.response_time_seconds!);
      const avgResponseSeconds = responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : null;

      const tomorrowScheduled = events.filter(e => {
        if (!e.next_action_date) return false;
        const d = new Date(e.next_action_date);
        return d >= tomorrowStartUtc && d < tomorrowEndUtc;
      }).length;

      const kpis = {
        hoje_total: todayEvents.length,
        amanha_agendados: tomorrowScheduled,
        taxa_resposta_pct: events.length > 0 ? +((respondedEvents.length / events.length) * 100).toFixed(1) : 0,
        media_por_lead: mediaPerLead,
        fecharam_contrato: contractEvents.length,
        tempo_medio_resposta_segundos: avgResponseSeconds,
      };

      const funil = {
        enviados: events.length,
        responderam: respondedEvents.length,
        avancaram: advancedEvents.length,
        fecharam_contrato: contractEvents.length,
      };

      // Volume diário
      const volumeMap = new Map<string, { dia: string; total_enviados: number; responderam: number; avancaram: number }>();
      for (const e of events) {
        const dia = e.sent_at.substring(0, 10);
        if (!volumeMap.has(dia)) volumeMap.set(dia, { dia: dia + 'T03:00:00.000Z', total_enviados: 0, responderam: 0, avancaram: 0 });
        const v = volumeMap.get(dia)!;
        v.total_enviados++;
        if (e.responded_at) v.responderam++;
        if (e.lead_advanced) v.avancaram++;
      }
      const volume_diario = Array.from(volumeMap.values()).sort((a, b) => a.dia.localeCompare(b.dia));

      // Cadências
      const cadMap = new Map<string, { cadence_name: string; cadence_step: number; total_disparos: number; responderam: number; tempos: number[] }>();
      for (const e of events) {
        const key = `${e.cadence_name}_${e.cadence_step}`;
        if (!cadMap.has(key)) cadMap.set(key, { cadence_name: e.cadence_name, cadence_step: e.cadence_step, total_disparos: 0, responderam: 0, tempos: [] });
        const c = cadMap.get(key)!;
        c.total_disparos++;
        if (e.responded_at) { c.responderam++; if (e.response_time_seconds) c.tempos.push(e.response_time_seconds); }
      }
      const cadencias = Array.from(cadMap.values()).sort((a, b) => a.cadence_step - b.cadence_step).map(c => ({
        cadence_name: c.cadence_name, cadence_step: c.cadence_step, total_disparos: c.total_disparos, responderam: c.responderam,
        taxa_resposta_pct: c.total_disparos > 0 ? +((c.responderam / c.total_disparos) * 100).toFixed(1) : 0,
        tempo_medio_horas: c.tempos.length > 0 ? +((c.tempos.reduce((a, b) => a + b, 0) / c.tempos.length) / 3600).toFixed(1) : null,
      }));

      // Timeline (last 50)
      const timeline = events.slice(0, 50).map(e => ({
        id: e.id, contact_name: e.contact_name || 'Cliente sem Nome', contact_phone: e.user_number || e.contact_phone,
        status: e.status, card_id: e.card_id, channel: e.channel, sent_at: e.sent_at, responded_at: e.responded_at,
        department: e.department, agente: e.agente, cadence_name: e.cadence_name, cadence_step: e.cadence_step,
        template_name: e.template_name, message_preview: e.message_preview,
        template_error: e.template_error, template_status: e.template_status,
        lead_advanced: e.lead_advanced, lead_closed_contract: e.lead_closed_contract,
        response_time_seconds: e.response_time_seconds, notes: e.notes,
      }));

      // Por Lead
      const leadMap = new Map<string, any>();
      for (const e of events) {
        const leadKey = e.user_number || e.contact_phone || e.card_id || e.id;
        if (!leadMap.has(leadKey)) {
          leadMap.set(leadKey, {
            contact_name: e.contact_name || 'Cliente sem Nome', contact_phone: e.user_number || e.contact_phone,
            card_id: e.card_id, department: e.department, agente: e.agente, total_disparos: 0, responderam: 0,
            lead_advanced: false, lead_closed_contract: false, ultima_etapa: 0,
            primeiro_disparo: e.sent_at, ultimo_disparo: e.sent_at, ultima_resposta: null as string | null, tempos: [] as number[],
          });
        }
        const l = leadMap.get(leadKey)!;
        l.total_disparos++;
        if (e.responded_at) { l.responderam++; l.ultima_resposta = e.responded_at; if (e.response_time_seconds) l.tempos.push(e.response_time_seconds); }
        if (e.lead_advanced) l.lead_advanced = true;
        if (e.lead_closed_contract) l.lead_closed_contract = true;
        if (e.cadence_step > l.ultima_etapa) l.ultima_etapa = e.cadence_step;
        if (e.sent_at < l.primeiro_disparo) l.primeiro_disparo = e.sent_at;
        if (e.sent_at > l.ultimo_disparo) l.ultimo_disparo = e.sent_at;
      }
      const por_lead = Array.from(leadMap.values()).map(l => ({
        ...l, tempo_medio_resposta_horas: l.tempos.length > 0 ? +((l.tempos.reduce((a: number, b: number) => a + b, 0) / l.tempos.length) / 3600).toFixed(1) : null, tempos: undefined,
      }));

      // Templates (exclui eventos sem template — janela 24h)
      const tplMap = new Map<string, { template_name: string; total_enviados: number; responderam: number; template_status: string; template_error: string | null; template_content: string | null; tempos: number[] }>();
      for (const e of events) {
        if (!e.template_name) continue;
        const tplName = e.template_name;
        if (!tplMap.has(tplName)) tplMap.set(tplName, { template_name: tplName, total_enviados: 0, responderam: 0, template_status: e.template_status || 'sent', template_error: e.template_error || null, template_content: e.template_content || null, tempos: [] });
        const t = tplMap.get(tplName)!;
        t.total_enviados++;
        if (e.template_error && !t.template_error) t.template_error = e.template_error;
        if (e.template_content && !t.template_content) t.template_content = e.template_content;
        if (e.responded_at) { t.responderam++; if (e.response_time_seconds) t.tempos.push(e.response_time_seconds); }
      }
      const templates = Array.from(tplMap.values()).map(t => ({
        template_name: t.template_name, total_enviados: t.total_enviados, responderam: t.responderam,
        taxa_resposta_pct: t.total_enviados > 0 ? +((t.responderam / t.total_enviados) * 100).toFixed(1) : 0,
        template_status: t.template_status, template_error: t.template_error, template_content: t.template_content,
        tempo_medio_horas: t.tempos.length > 0 ? +((t.tempos.reduce((a, b) => a + b, 0) / t.tempos.length) / 3600).toFixed(1) : null,
      })).sort((a, b) => b.total_enviados - a.total_enviados);

      // Heatmap
      const heatData = new Map<string, number>();
      for (const e of events) {
        if (!e.responded_at) continue;
        const d = new Date(e.responded_at);
        const key = `${d.getDay()}_${d.getHours()}`;
        heatData.set(key, (heatData.get(key) || 0) + 1);
      }
      const heatmap = Array.from(heatData.entries()).map(([key, total]) => {
        const [dia, hora] = key.split('_').map(Number);
        return { dia_semana: dia, hora, total_respostas: total };
      });

      const snapshot = {
        id: 'aggregated', client_id: resolvedClientId, periodo_dias: periodoDias,
        data: { kpis, funil, volume_diario, cadencias, timeline, por_lead, templates, heatmap },
        gerado_em: now.toISOString(), created_at: now.toISOString(),
      };

      return new Response(JSON.stringify({ ok: true, snapshot }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── POST: Recebe eventos individuais ───
    const payload = await req.json();

    // Aceita: { data: [...] } ou [...] ou { ... }
    let eventsList: any[];
    if (payload.data && Array.isArray(payload.data)) {
      eventsList = payload.data;
    } else if (Array.isArray(payload)) {
      eventsList = payload;
    } else {
      eventsList = [payload];
    }

    const inserted: string[] = [];
    const errors: string[] = [];

    for (const evt of eventsList) {
      const clientRaw = evt.client_id;
      if (!clientRaw) { errors.push('event missing client_id'); continue; }

      const resolvedClientId = await resolveClientId(clientRaw);

      const row: Record<string, any> = {
        client_id: resolvedClientId,
        user_number: evt.user_number || null,
        card_id: evt.card_id || null,
        contact_name: evt.contact_name || 'Cliente sem Nome',
        contact_phone: evt.user_number || evt.contact_phone || null,
        cadence_name: evt.cadence_name || 'default',
        cadence_step: evt.cadence_step ?? 1,
        cadence_total_steps: evt.cadence_total_steps ?? 7,
        message_id: evt.message_id || null,
        message_preview: evt.mensagem || evt.message_preview || null,
        department: evt.department || null,
        channel: evt.channel || 'whatsapp',
        template_name: evt.template_name || evt.template || evt.template_content || null,
        template_content: evt.template || evt.template_content || null,
        template_status: evt.template_status || null,
        template_error: evt.template_error || null,
        status: evt.status || 'sent',
        sent_at: evt.sent_at || new Date().toISOString(),
        responded_at: evt.responded_at || null,
        response_time_seconds: evt.response_time_seconds || null,
        engagement_score: evt.engagement_score ?? 0,
        lead_advanced: evt.lead_advanced ?? false,
        lead_closed_contract: evt.lead_closed_contract ?? false,
        next_action_date: evt.next_action_date || null,
        next_action_type: evt.next_action_type || null,
        notes: evt.observacao || evt.notes || null,
        tipo_followup: evt.tipo_followup || null,
        categoria: evt.categoria || null,
        agente: evt.agente || null,
      };

      // If the payload includes an id, use it as the PK for upsert
      if (evt.id) {
        row.id = evt.id;
      }

      // Upsert by id (PK) — same id = update, new id = insert
      const { data: upserted, error: opError } = await supabase
        .from('ai_followup_events')
        .upsert(row, { onConflict: 'id' })
        .select('id')
        .single();

      if (opError) {
        console.error('Upsert error:', opError);
        errors.push(`${evt.contact_name || evt.user_number}: ${opError.message}`);
      } else if (upserted) {
        inserted.push(upserted.id);
      }
    }

    return new Response(JSON.stringify({
      ok: errors.length === 0,
      inserted: inserted.length,
      errors: errors.length > 0 ? errors : undefined,
      ids: inserted,
    }), {
      status: errors.length > 0 && inserted.length === 0 ? 400 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('AI followup webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
