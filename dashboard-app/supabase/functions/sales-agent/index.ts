import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Step title mapping (matches frontend normalizeStep.ts)
const STEP_PATTERNS: Record<string, string[]> = {
  "SDR": ["SDR"],
  "CLOSER": ["COMERCIAL", "CLOSER"],
  "CONTRATO": ["CONTRATO EM ELABORAÇÃO", "ELABORA"],
  "ETAPA DE ASSINATURA": ["AGUARDANDO ASSINATURA"],
  "CONTRATO FECHADO": ["CONTRATO ASSINADO"],
  "DESQUALIFICADO": ["DESQUALIFICADO", "DESCARTADO", "NÃO SEGUIU"],
  "ANALISE MANUAL": ["ANÁLISE MANUAL"],
};

function classifyStep(stepTitle: string): string {
  const normalized = stepTitle
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, "")
    .replace(/[^a-zA-Z0-9À-ÿ\s]/g, "")
    .trim()
    .toUpperCase();
  for (const [key, patterns] of Object.entries(STEP_PATTERNS)) {
    for (const p of patterns) {
      if (normalized.includes(p)) return key;
    }
  }
  return normalized;
}

// Map step keywords from AI intent to actual step_title values in DB
const STEP_TITLE_MAP: Record<string, string[]> = {
  "SDR": ["📞 SDR"],
  "CLOSER": ["🛒 Comercial"],
  "CONTRATO": ["📄 Contrato em Elaboração"],
  "ETAPA DE ASSINATURA": ["✍️ Aguardando Assinatura"],
  "CONTRATO FECHADO": ["✅ Contrato Assinado"],
  "DESQUALIFICADO": ["❌ Desqualificado", "🚫 Não seguiu com o contrato"],
  "ANALISE MANUAL": ["🕵️‍♂️ Análise Manual"],
};

function getStepTitlesForFilter(steps: string[]): string[] {
  const titles: string[] = [];
  for (const step of steps) {
    const upper = step.toUpperCase();
    for (const [key, values] of Object.entries(STEP_TITLE_MAP)) {
      if (upper.includes(key) || key.includes(upper)) {
        titles.push(...values);
      }
    }
  }
  return [...new Set(titles)];
}

interface QueryIntent {
  dateFrom?: string;
  dateTo?: string;
  steps?: string[];
  queryType: "count" | "comparison" | "listing" | "report" | "aggregate_by_month" | "stale";
  staleThresholdDays?: number;
  comparePeriods?: { dateFrom: string; dateTo: string; label: string }[];
}

async function interpretIntent(
  messages: { role: string; content: string }[],
  apiKey: string
): Promise<QueryIntent> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  
  const today = new Date().toISOString().split("T")[0];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `Você é um classificador de intenções para um sistema de CRM de advocacia. A data de hoje é ${today}. O ano atual é ${currentYear}, mês atual é ${currentMonth}.

Analise a pergunta do usuário e retorne um JSON com:
- dateFrom: data início no formato YYYY-MM-DD (ou null se não aplicável)
- dateTo: data fim no formato YYYY-MM-DD (ou null se não aplicável)  
- steps: array de etapas relevantes dentre: ["SDR", "CLOSER", "CONTRATO", "ETAPA DE ASSINATURA", "CONTRATO FECHADO", "DESQUALIFICADO"]. Array vazio se todas.
- queryType: "count" | "comparison" | "listing" | "report" | "aggregate_by_month" | "stale"
- staleThresholdDays: número de dias para filtrar leads parados (apenas se queryType=stale)
- comparePeriods: array de {dateFrom, dateTo, label} se for comparação entre períodos

Se o usuário pedir "deste mês" ou "este mês", use o mês atual. Se pedir "mês passado", use o mês anterior. Se pedir "melhor mês", use queryType "aggregate_by_month".
Se pedir sobre leads "parados" ou "há mais de X dias", use queryType "stale".

Retorne APENAS o JSON, sem markdown.`,
        },
        { role: "user", content: lastUserMsg },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    console.error("Intent classification failed:", resp.status);
    return { queryType: "report" };
  }

  const data = await resp.json();
  try {
    const content = data.choices?.[0]?.message?.content || "{}";
    return JSON.parse(content);
  } catch {
    console.error("Failed to parse intent JSON");
    return { queryType: "report" };
  }
}

async function queryDatabase(
  supabase: ReturnType<typeof createClient>,
  intent: QueryIntent,
  clientId?: string
): Promise<string> {
  const results: string[] = [];

  if (intent.queryType === "aggregate_by_month") {
    // Get all cards, group by month
    let query = supabase.from("helena_cards").select("created_at, step_title, archived").eq("archived", false);
    if (clientId) query = query.eq("client_id", clientId);
    const stepTitles = intent.steps?.length ? getStepTitlesForFilter(intent.steps) : [];
    if (stepTitles.length) {
      query = query.in("step_title", stepTitles);
    }
    const { data, error } = await query;
    if (error) {
      results.push(`Erro na consulta: ${error.message}`);
    } else if (data) {
      const byMonth: Record<string, number> = {};
      for (const card of data) {
        const month = card.created_at.substring(0, 7); // YYYY-MM
        byMonth[month] = (byMonth[month] || 0) + 1;
      }
      const sorted = Object.entries(byMonth).sort((a, b) => b[1] - a[1]);
      results.push(`Dados agrupados por mês (${data.length} cards total):`);
      for (const [month, count] of sorted.slice(0, 12)) {
        results.push(`- ${month}: ${count} cards`);
      }
      if (sorted.length > 0) {
        results.push(`Melhor mês: ${sorted[0][0]} com ${sorted[0][1]} cards`);
      }
    }
  } else if (intent.queryType === "stale") {
    // Find stale cards
    const stepTitles = intent.steps?.length ? getStepTitlesForFilter(intent.steps) : [];
    const threshold = intent.staleThresholdDays || 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - threshold);
    
    let query = supabase.from("helena_cards")
      .select("id, title, step_title, updated_at, created_at, contacts")
      .eq("archived", false)
      .lt("updated_at", cutoff.toISOString());
    if (clientId) query = query.eq("client_id", clientId);
    
    if (stepTitles.length) {
      query = query.in("step_title", stepTitles);
    }
    
    const { data, error } = await query.limit(50);
    if (error) {
      results.push(`Erro: ${error.message}`);
    } else if (data) {
      results.push(`Encontrados ${data.length} cards parados há mais de ${threshold} dias:`);
      for (const card of data.slice(0, 20)) {
        const daysStale = Math.floor((Date.now() - new Date(card.updated_at).getTime()) / 86400000);
        const contactName = Array.isArray(card.contacts) && card.contacts.length > 0
          ? (card.contacts[0] as Record<string, string>)?.name || "Sem nome"
          : "Sem nome";
        results.push(`- "${card.title || contactName}" em ${card.step_title} — parado há ${daysStale} dias`);
      }
    }
  } else if (intent.queryType === "comparison" && intent.comparePeriods?.length) {
    // Compare periods
    for (const period of intent.comparePeriods) {
      let query = supabase.from("helena_cards")
        .select("step_title, archived")
        .eq("archived", false)
        .gte("created_at", period.dateFrom)
        .lte("created_at", period.dateTo + "T23:59:59Z");
      if (clientId) query = query.eq("client_id", clientId);
      
      const { data, error } = await query;
      if (error) {
        results.push(`Erro para ${period.label}: ${error.message}`);
      } else if (data) {
        const counts: Record<string, number> = {};
        for (const card of data) {
          const step = classifyStep(card.step_title || "");
          counts[step] = (counts[step] || 0) + 1;
        }
        results.push(`\nPeríodo ${period.label} (${period.dateFrom} a ${period.dateTo}):`);
        results.push(`- Total: ${data.length}`);
        for (const [step, count] of Object.entries(counts)) {
          results.push(`- ${step}: ${count}`);
        }
        const closed = counts["CONTRATO FECHADO"] || 0;
        results.push(`- Conversão geral: ${data.length > 0 ? ((closed / data.length) * 100).toFixed(1) : 0}%`);
      }
    }
  } else {
    // Default: count/listing/report for a date range
    let query = supabase.from("helena_cards")
      .select("id, title, step_title, created_at, updated_at, archived, contacts, monetary_amount")
      .eq("archived", false);
    if (clientId) query = query.eq("client_id", clientId);
    
    if (intent.dateFrom) query = query.gte("created_at", intent.dateFrom);
    if (intent.dateTo) query = query.lte("created_at", intent.dateTo + "T23:59:59Z");
    
    const stepTitles = intent.steps?.length ? getStepTitlesForFilter(intent.steps) : [];
    if (stepTitles.length) {
      query = query.in("step_title", stepTitles);
    }
    
    const { data, error } = await query;
    if (error) {
      results.push(`Erro na consulta: ${error.message}`);
    } else if (data) {
      // Summary by step
      const counts: Record<string, number> = {};
      let totalMonetary = 0;
      for (const card of data) {
        const step = classifyStep(card.step_title || "");
        counts[step] = (counts[step] || 0) + 1;
        if (card.monetary_amount) totalMonetary += Number(card.monetary_amount);
      }
      
      const period = intent.dateFrom && intent.dateTo
        ? `de ${intent.dateFrom} a ${intent.dateTo}`
        : intent.dateFrom ? `a partir de ${intent.dateFrom}` 
        : intent.dateTo ? `até ${intent.dateTo}`
        : "todo o período";
      
      results.push(`Dados consultados (${period}):`);
      results.push(`- Total de cards: ${data.length}`);
      for (const [step, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        results.push(`- ${step}: ${count}`);
      }
      
      // Conversion rates
      const total = data.length;
      const closed = counts["CONTRATO FECHADO"] || 0;
      const closer = counts["CLOSER"] || 0;
      if (total > 0) {
        results.push(`- Conversão geral (fechados/total): ${((closed / total) * 100).toFixed(1)}%`);
      }
      const sdr = counts["SDR"] || 0;
      const desq = counts["DESQUALIFICADO"] || 0;
      const advancedFromSdr = total - sdr - desq;
      if (advancedFromSdr > 0) {
        results.push(`- Eficiência (fechados/avançaram do SDR): ${((closed / advancedFromSdr) * 100).toFixed(1)}%`);
      }
      if (totalMonetary > 0) {
        results.push(`- Valor monetário total: R$ ${totalMonetary.toLocaleString("pt-BR")}`);
      }

      // If listing, show some cards
      if (intent.queryType === "listing" && data.length <= 30) {
        results.push(`\nListagem:`);
        for (const card of data.slice(0, 20)) {
          const contactName = Array.isArray(card.contacts) && card.contacts.length > 0
            ? (card.contacts[0] as Record<string, string>)?.name || card.title
            : card.title;
          results.push(`- ${contactName} | ${card.step_title} | criado em ${card.created_at.substring(0, 10)}`);
        }
        if (data.length > 20) results.push(`... e mais ${data.length - 20} cards`);
      }
    }
  }

  return results.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, clientId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Phase 1: Interpret intent
    console.log("Phase 1: Interpreting intent...");
    const intent = await interpretIntent(messages || [], LOVABLE_API_KEY);
    console.log("Intent:", JSON.stringify(intent));

    // Phase 2: Query database
    console.log("Phase 2: Querying database...", clientId ? `clientId: ${clientId}` : "no client filter");
    const dbResults = await queryDatabase(supabase, intent, clientId);
    console.log("DB results length:", dbResults.length);

    // Phase 3: Stream response
    const systemPrompt = `Você é um especialista em funil de vendas para escritórios de advocacia.
O processo de vendas é feito 100% via WhatsApp — NÃO existe marcação de reuniões. O fechamento acontece diretamente na conversa do WhatsApp.
O público-alvo são advogados e escritórios de advocacia.
Nunca sugira "marcar reunião", "agendar call" ou qualquer forma de encontro presencial/virtual. Foque em estratégias de conversão via mensagem.

Responda de forma direta e objetiva. Use os dados reais consultados no banco abaixo.
Seja conciso para perguntas factuais (3-5 linhas). Seja detalhado apenas quando pedirem análise completa ou relatório.
Use Markdown para formatar: **negrito**, ### títulos, - listas. Emojis são permitidos.

${dbResults}`;

    const allMessages = [
      { role: "system", content: systemPrompt },
      ...(messages || []),
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: allMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("sales-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
