import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const externalDbUrl = Deno.env.get('EXTERNAL_LEADS_DB_URL')
    if (!externalDbUrl) {
      throw new Error('EXTERNAL_LEADS_DB_URL not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Connect to external database
    const sql = postgres(externalDbUrl, { max: 1, idle_timeout: 10 })

    // Fetch leads from external DB - adjust table/query as needed
    const externalLeads = await sql`SELECT * FROM "Notificações" ORDER BY id DESC LIMIT 500`
    await sql.end()

    if (!externalLeads || externalLeads.length === 0) {
      return new Response(JSON.stringify({ synced: 0, message: 'No leads found in external DB' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Map company_id to client_id
    const companyIds = [...new Set(externalLeads.map((l: any) => l.companyId || l.company_id).filter(Boolean))]
    const { data: clients } = await supabase
      .from('clients')
      .select('id, helena_company_id')
      .in('helena_company_id', companyIds)

    const companyToClient: Record<string, string> = {}
    if (clients) {
      clients.forEach((c: any) => {
        if (c.helena_company_id) companyToClient[c.helena_company_id] = c.id
      })
    }

    // Upsert leads
    let synced = 0
    for (const lead of externalLeads) {
      const companyId = lead.companyId || lead.company_id || null
      const clientId = companyId ? companyToClient[companyId] || null : null

      const row = {
        external_id: lead.id,
        client_id: clientId,
        company_id: companyId,
        user_number: lead.user_number?.toString() || null,
        user_name: lead.user_name || null,
        id_chat: lead.id_chat || null,
        id_linkconversa: lead.id_linkconversa || null,
        agente: lead.agente || null,
        id_cardcrm: lead.id_cardcrm || null,
        idcontato: lead.idcontato || null,
        id_campanha_link: lead.id_campanha_link || null,
        horario_notificacao: lead['Horario da Notificação'] || lead.horario_notificacao || null,
        external_status: lead.Status || lead.status || null,
        synced_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('notificativo_leads')
        .upsert(row, { onConflict: 'external_id' })

      if (!error) synced++
    }

    return new Response(JSON.stringify({ synced, total: externalLeads.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
