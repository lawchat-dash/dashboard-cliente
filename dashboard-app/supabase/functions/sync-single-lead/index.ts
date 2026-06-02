import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const CHAT_V1_URL = 'https://api.helena.run/chat/v1'
const CHAT_V2_URL = 'https://api.helena.run/chat/v2'

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

    const { externalId, leadId, userNumber } = await req.json()

    if (!externalId && !leadId && !userNumber) {
      return new Response(JSON.stringify({ error: 'externalId, leadId, or userNumber required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sql = postgres(externalDbUrl, { max: 1, idle_timeout: 10 })

    let externalLeads: any[]

    if (externalId) {
      externalLeads = await sql`SELECT * FROM "Notificações" WHERE id = ${externalId} LIMIT 1`
    } else if (userNumber) {
      const cleanNumber = userNumber.replace(/\D/g, '')
      externalLeads = await sql`
        SELECT * FROM "Notificações" 
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(user_number, ' ', ''), '(', ''), ')', ''), '-', '') LIKE ${'%' + cleanNumber.slice(-8)}
        ORDER BY id DESC 
        LIMIT 5
      `
    } else {
      externalLeads = []
    }

    await sql.end()

    if (!externalLeads || externalLeads.length === 0) {
      return new Response(JSON.stringify({ error: 'Lead not found in external DB', synced: 0 }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Map company_id to client_id
    const companyIds = [...new Set(externalLeads.map((l: any) => l.companyId || l.company_id).filter(Boolean))]
    let companyToClient: Record<string, { id: string; apiKey: string }> = {}
    if (companyIds.length > 0) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, helena_company_id, helena_api_key')
        .in('helena_company_id', companyIds)
      if (clients) {
        clients.forEach((c: any) => {
          if (c.helena_company_id) companyToClient[c.helena_company_id] = { id: c.id, apiKey: c.helena_api_key }
        })
      }
    }

    let synced = 0
    const results: any[] = []

    for (const lead of externalLeads) {
      const companyId = lead.companyId || lead.company_id || null
      const clientInfo = companyId ? companyToClient[companyId] || null : null
      const clientId = clientInfo?.id || null

      const row: Record<string, any> = {
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

      // If no id_chat from external DB, try to fetch from Helena API using idcontato
      if (!row.id_chat && row.idcontato && clientInfo?.apiKey) {
        try {
          console.log(`🔍 Trying Helena API for contact ${row.idcontato}`)
          const apiHeaders = {
            'access-token': clientInfo.apiKey,
            'Content-Type': 'application/json',
          }

          // Fetch sessions for this contact
          const sessionsRes = await fetch(
            `${CHAT_V1_URL}/contact/${row.idcontato}/sessions?limit=5&offset=0`,
            { headers: apiHeaders }
          )

          if (sessionsRes.ok) {
            const sessionsData = await sessionsRes.json()
            const sessions = sessionsData?.data || sessionsData || []

            if (Array.isArray(sessions) && sessions.length > 0) {
              // Use the most recent session as id_chat
              const latestSession = sessions[0]
              row.id_chat = latestSession.id || null
              console.log(`✅ Found session ${row.id_chat} for contact ${row.idcontato}`)

              // Also sync these sessions to helena_sessions table
              const now = new Date().toISOString()
              for (const session of sessions.slice(0, 3)) {
                try {
                  const detailRes = await fetch(
                    `${CHAT_V2_URL}/session/${session.id}?includeDetails=AgentDetails&includeDetails=DepartmentsDetails&includeDetails=ContactDetails&includeDetails=ChannelTypeDetails&includeDetails=ClassificationDetails&includeDetails=ChannelDetails`,
                    { headers: apiHeaders }
                  )
                  if (detailRes.ok) {
                    const detail = await detailRes.json()
                    const utm = detail.utm || {}
                    const sessionRow = {
                      id: session.id,
                      card_id: row.id_cardcrm || null,
                      contact_id: row.idcontato,
                      client_id: clientId,
                      client_name: null,
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
                    }
                    await supabase.from('helena_sessions').upsert(sessionRow, { onConflict: 'id' })
                  }
                } catch (sessionErr) {
                  console.warn(`Session detail fetch failed for ${session.id}:`, sessionErr.message)
                }
              }
            } else {
              console.log(`⚠️ No sessions found for contact ${row.idcontato}`)
            }
          } else {
            console.warn(`Helena API returned ${sessionsRes.status} for contact ${row.idcontato}`)
          }
        } catch (helenaErr) {
          console.warn(`Helena session lookup failed:`, helenaErr.message)
        }
      }

      const { data, error } = await supabase
        .from('notificativo_leads')
        .upsert(row, { onConflict: 'external_id' })
        .select()

      if (!error) {
        synced++
        results.push({ external_id: lead.id, id_chat: row.id_chat, user_name: row.user_name })
      } else {
        console.error('Upsert error:', error)
      }
    }

    return new Response(JSON.stringify({ synced, total: externalLeads.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Sync single lead error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
