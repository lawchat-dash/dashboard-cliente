import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let eventId: string | null = null;

  try {
    const payload = await req.json();
    const body = Array.isArray(payload) ? payload[0]?.body || payload[0] : payload.body || payload;
    const eventType = body?.eventType;
    const content = body?.content;

    if (!eventType || !content) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no eventType or content' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Webhook received: ${eventType}, id: ${content.id}`);

    // ── Log event to webhook_events ──
    const { data: evt } = await supabase
      .from('webhook_events')
      .insert({
        event_type: eventType,
        content_id: content.id || null,
        payload: body,
        processed: false,
      })
      .select('id')
      .single();

    eventId = evt?.id || null;

    // ── MESSAGE_UPDATED — insert into live_messages ──
    if (eventType === 'MESSAGE_UPDATED') {
      const sessionId = content.sessionId;
      let clientId: string | null = null;
      let contactName: string | null = null;
      let contactPhone: string | null = null;

      if (sessionId) {
        const { data: session } = await supabase
          .from('helena_sessions')
          .select('client_id, contact_name, contact_phone')
          .eq('id', sessionId)
          .maybeSingle();

        if (session) {
          clientId = session.client_id;
          contactName = session.contact_name;
          contactPhone = session.contact_phone;
        }
      }

      // Fallback: resolve client_id from companyId if session not found
      if (!clientId && content.companyId) {
        clientId = await resolveClientId(content.companyId);
      }

      if (clientId && content.text) {
        const { error: lmError } = await supabase.from('live_messages').upsert({
          id: content.id,
          client_id: clientId,
          company_id: content.companyId || null,
          session_id: sessionId,
          text: content.text,
          direction: content.direction || 'FROM_HUB',
          origin: content.origin || 'GATEWAY',
          status: content.status || null,
          sender_from: content.details?.from || null,
          sender_to: content.details?.to || null,
          contact_name: contactName,
          contact_phone: contactPhone,
          created_at: content.createdAt || new Date().toISOString(),
        }, { onConflict: 'id' });

        if (lmError) console.error('live_messages upsert error:', lmError);
      }

      if (eventId) await supabase.from('webhook_events').update({ processed: true }).eq('id', eventId);
      return new Response(JSON.stringify({ ok: true, event: eventType }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── MESSAGE_RECEIVED / MESSAGE_SENT ──
    if (eventType === 'MESSAGE_RECEIVED' || eventType === 'MESSAGE_SENT') {
      const sessionId = content.sessionId;
      if (sessionId) {
        const { data: existing } = await supabase
          .from('helena_sessions')
          .select('session_detail_full')
          .eq('id', sessionId)
          .maybeSingle();

        if (existing) {
          const detail = existing.session_detail_full || {};
          detail.lastMessageText = content.text || detail.lastMessageText;
          detail.lastMessageAt = content.timestamp || detail.lastMessageAt;
          if (eventType === 'MESSAGE_RECEIVED') {
            detail.lastMessageIn = content.timestamp;
          } else {
            detail.lastMessageOut = content.timestamp;
          }

          const { error } = await supabase
            .from('helena_sessions')
            .update({ session_detail_full: detail, synced_at: new Date().toISOString() })
            .eq('id', sessionId);

          if (error) console.error(`${eventType} update error:`, error);
        }
      }
      if (eventId) await supabase.from('webhook_events').update({ processed: true }).eq('id', eventId);
      return new Response(JSON.stringify({ ok: true, event: eventType }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();

    // Helper: resolve client_id from companyId
    async function resolveClientId(companyId: string | null): Promise<string | null> {
      if (!companyId) return null;
      const { data } = await supabase
        .from('clients')
        .select('id')
        .eq('helena_company_id', companyId)
        .maybeSingle();
      return data?.id || null;
    }

    // ── SESSION_NEW ──
    if (eventType === 'SESSION_NEW') {
      const utm = content.utm || {};
      const cd = content.contactDetails || {};
      const dd = content.departmentDetails || {};
      const chd = content.channelDetails || {};

      const clientId = await resolveClientId(content.companyId);

      const row = {
        id: content.id,
        card_id: null,
        client_id: clientId,
        contact_id: content.contactId || cd.id || null,
        status: content.status || null,
        session_created_at: content.createdAt || null,
        session_closed_at: content.endAt || null,
        agent_name: content.agentDetails?.name || null,
        department_name: dd.name || null,
        channel_type: content.channelType || null,
        channel_name: chd.displayName || chd.id || null,
        classification: content.classification || null,
        contact_name: cd.name || null,
        contact_phone: cd.phonenumberFormatted || cd.phonenumber || null,
        contact_email: cd.email || null,
        utm_source: utm.source || null,
        utm_source_id: utm.sourceId || null,
        utm_medium: utm.medium || null,
        utm_campaign: utm.campaign || null,
        utm_content: utm.content || null,
        utm_headline: utm.headline || null,
        utm_term: utm.term || null,
        utm_referral_url: utm.referralUrl || null,
        utm_clid: utm.clid || null,
        session_detail_full: content,
        synced_at: now,
      };

      const { error } = await supabase.from('helena_sessions').upsert(row, { onConflict: 'id' });
      if (error) console.error('SESSION_NEW upsert error:', error);
      else console.log(`SESSION_NEW: created session ${content.id} for client ${clientId}`);

      if (eventId) await supabase.from('webhook_events').update({ processed: true }).eq('id', eventId);
      return new Response(JSON.stringify({ ok: true, event: eventType }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── CONTACT_NEW ──
    if (eventType === 'CONTACT_NEW') {
      console.log(`CONTACT_NEW: ${content.name} (${content.phonenumberFormatted})`);
      if (eventId) await supabase.from('webhook_events').update({ processed: true }).eq('id', eventId);
      return new Response(JSON.stringify({ ok: true, event: eventType, logged: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── CONTACT_UPDATE ──
    if (eventType === 'CONTACT_UPDATE') {
      const contactId = content.id;
      const utm = content.utm || {};
      const updates: Record<string, any> = {
        contact_name: content.name || null,
        contact_phone: content.phonenumberFormatted || content.phonenumber || null,
        contact_email: content.email || null,
        synced_at: now,
      };
      if (utm.source) updates.utm_source = utm.source;
      if (utm.sourceId) updates.utm_source_id = utm.sourceId;
      if (utm.medium) updates.utm_medium = utm.medium;
      if (utm.campaign) updates.utm_campaign = utm.campaign;
      if (utm.content) updates.utm_content = utm.content;
      if (utm.headline) updates.utm_headline = utm.headline;
      if (utm.term) updates.utm_term = utm.term;
      if (utm.referralUrl) updates.utm_referral_url = utm.referralUrl;
      if (utm.clid) updates.utm_clid = utm.clid;

      const { error } = await supabase
        .from('helena_sessions')
        .update(updates)
        .eq('contact_id', contactId);

      if (error) console.error('CONTACT_UPDATE error:', error);

      if (eventId) await supabase.from('webhook_events').update({ processed: true }).eq('id', eventId);
      return new Response(JSON.stringify({ ok: true, event: eventType }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── CONTACT_TAG_UPDATE ──
    if (eventType === 'CONTACT_TAG_UPDATE') {
      const contactId = content.id;
      const tagsId = content.tagsId || [];
      const tagsName = content.tags || [];

      const { data: sessions } = await supabase
        .from('helena_sessions')
        .select('id, session_detail_full')
        .eq('contact_id', contactId);

      if (sessions && sessions.length > 0) {
        for (const s of sessions) {
          const detail = s.session_detail_full || {};
          if (detail.contactDetails) {
            detail.contactDetails.tagsId = tagsId;
            detail.contactDetails.tagsName = tagsName;
          }
          await supabase
            .from('helena_sessions')
            .update({ session_detail_full: detail, synced_at: now })
            .eq('id', s.id);
        }
      }

      const { data: cards } = await supabase
        .from('helena_cards')
        .select('id, contact_ids')
        .contains('contact_ids', JSON.stringify([contactId]));

      if (cards && cards.length > 0) {
        for (const card of cards) {
          await supabase
            .from('helena_cards')
            .update({ tags_name: tagsName, synced_at: now })
            .eq('id', card.id);
        }
      }

      if (eventId) await supabase.from('webhook_events').update({ processed: true }).eq('id', eventId);
      return new Response(JSON.stringify({ ok: true, event: eventType }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── PANEL_CARD_UPDATE / PANEL_CARD_STEP_CHANGE ──
    if (eventType === 'PANEL_CARD_UPDATE' || eventType === 'PANEL_CARD_STEP_CHANGE') {
      const tags = content.tags || [];
      const tagIds = tags.map((t: any) => t.id);
      const tagNames = tags.map((t: any) => t.text);
      const contacts = content.contacts || [];
      const contactIds = contacts.map((c: any) => c.id);

      // Resolve client_id from companyId
      const clientId = await resolveClientId(content.companyId);

      const row = {
        id: content.id,
        created_at: content.createdAt,
        updated_at: content.updatedAt || content.createdAt,
        archived: content.archived ?? false,
        company_id: content.companyId || null,
        client_id: clientId,
        panel_id: content.panelId || null,
        panel_title: content.panelTitle || null,
        step_id: content.stepId || null,
        step_title: content.stepTitle || null,
        step_phase: content.stepPhase || null,
        position: content.position ?? null,
        title: content.title || null,
        key: content.key || null,
        number: content.number || null,
        description: content.description || null,
        due_date: content.dueDate || null,
        is_overdue: content.isOverdue ?? false,
        tag_ids: tagIds,
        tags_name: tagNames,
        monetary_amount: content.monetaryAmount || null,
        responsible_user: content.responsibleUserName
          ? { name: content.responsibleUserName }
          : null,
        responsible_user_id: content.responsibleUserId || null,
        contact_ids: contactIds,
        contacts: contacts,
        custom_fields: content.customFieldValues || {},
        metadata: content.metadata || null,
        session_id: content.sessionId || null,
        synced_at: now,
      };

      const { error } = await supabase.from('helena_cards').upsert(row, { onConflict: 'id' });
      if (error) console.error(`${eventType} upsert error:`, error);
      else console.log(`${eventType}: card ${content.id} → step "${content.stepTitle}" for client ${clientId}`);

      // If session_id exists, also link it in helena_sessions
      if (content.sessionId && content.id) {
        await supabase
          .from('helena_sessions')
          .update({ card_id: content.id, synced_at: now })
          .eq('id', content.sessionId);
      }

      if (eventId) await supabase.from('webhook_events').update({ processed: true }).eq('id', eventId);
      return new Response(JSON.stringify({ ok: true, event: eventType }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Unknown event
    console.log(`Unhandled event: ${eventType}`);
    if (eventId) await supabase.from('webhook_events').update({ processed: true }).eq('id', eventId);
    return new Response(JSON.stringify({ ok: true, skipped: eventType }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    if (eventId) {
      await supabase.from('webhook_events').update({ processed: false, error: error.message }).eq('id', eventId);
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
