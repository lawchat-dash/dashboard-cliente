import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PERIOD_LABELS: Record<string, string> = {
  today: "Hoje",
  "3d": "Últimos 3 Dias",
  "7d": "Últimos 7 Dias",
  "15d": "Últimos 15 Dias",
  "30d": "Últimos 30 Dias",
  complete: "Relatório Completo",
};

const ALL_PERIODS = ["today", "3d", "7d", "15d", "30d"];

interface Metrics {
  total_leads: number;
  sdr: number;
  closer: number;
  contrato: number;
  assinatura: number;
  assinado: number;
  desqualificado: number;
  nao_assinou: number;
  conversion_rate: number;
}

/* ───────── Sanitização e validação de métricas ───────── */

function sanitizeMetrics(raw: any): Metrics {
  const safeInt = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  };
  const safeRate = (v: any): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (n > 100) return 100;
    return Math.round(n * 10) / 10; // 1 casa decimal
  };

  return {
    total_leads: safeInt(raw?.total_leads),
    sdr: safeInt(raw?.sdr),
    closer: safeInt(raw?.closer),
    contrato: safeInt(raw?.contrato),
    assinatura: safeInt(raw?.assinatura),
    assinado: safeInt(raw?.assinado),
    desqualificado: safeInt(raw?.desqualificado),
    nao_assinou: safeInt(raw?.nao_assinou),
    conversion_rate: safeRate(raw?.conversion_rate),
  };
}

function validateMetrics(m: Metrics): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Soma das etapas não deve ser maior que total_leads (tolerância de 5%)
  const somaEtapas = m.sdr + m.closer + m.contrato + m.assinatura + m.assinado + m.desqualificado + m.nao_assinou;
  if (m.total_leads > 0 && somaEtapas > m.total_leads * 1.05) {
    warnings.push(`Soma das etapas (${somaEtapas}) excede total de leads (${m.total_leads})`);
  }

  // Assinados não devem ser maiores que contrato
  if (m.assinado > m.contrato && m.contrato > 0) {
    warnings.push(`Assinados (${m.assinado}) maior que Contratos (${m.contrato})`);
  }

  // Conversion rate deve ser coerente
  if (m.total_leads > 0) {
    const expectedRate = Math.round((m.assinado / m.total_leads) * 1000) / 10;
    if (Math.abs(expectedRate - m.conversion_rate) > 1) {
      // Corrige silenciosamente
      m.conversion_rate = expectedRate;
    }
  }

  return { valid: warnings.length === 0, warnings };
}

function formatNumber(n: number): string {
  return n.toLocaleString("pt-BR");
}

function formatRate(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function funnelPercent(value: number, total: number): string {
  if (total <= 0) return "0%";
  return Math.round((value / total) * 100) + "%";
}

/* ───────── Single-period report prompt ───────── */

function buildReportPrompt(clientName: string, date: string, periodLabel: string, m: Metrics, logoUrl: string): string {
  const total = m.total_leads || 1;
  return `Generate a dark-themed professional analytics report card image (800 wide, 700 tall).

IMPORTANT: Do NOT render any pixel measurements, guidelines, annotations, or technical references anywhere in the image. This is a final deliverable, not a wireframe.

LOGO: Place the logo from this URL at the top-left corner: ${logoUrl}
If you cannot load the URL, write "⚖️ LawChat" in bright green #00BC33 as fallback text.

CANVAS: Dark background #0D1117, rounded corners, subtle border #1B2130.

TOP ACCENT: A thin gradient bar at the very top from #00BC33 to #00D639, full width.

HEADER AREA with comfortable margins on all sides:
- Logo area top-left, small
- Title right of logo: "${periodLabel} — ${clientName}" in white, bold
- Subtitle below title: "${date}" in gray
- Right-aligned badge: "Conv: ${formatRate(m.conversion_rate)}%" in a green pill shape

DIVIDER: Thin horizontal line #21262D below header with generous margins.

METRICS GRID below divider with generous spacing:
- 2 rows of 4 cards with comfortable gaps
- Each card: dark rounded rectangle #161B22, subtle border #21262D
- Number: centered, large bold white text
- Label: centered below number, small uppercase gray text

Row 1: "${formatNumber(m.total_leads)}" LEADS | "${formatNumber(m.sdr)}" SDR | "${formatNumber(m.closer)}" CLOSER | "${formatNumber(m.contrato)}" CONTRATO
Row 2: "${formatNumber(m.assinatura)}" ASSIN. | "${formatNumber(m.assinado)}" ASSINADOS (number in green #00BC33, label with checkmark) | "${formatNumber(m.desqualificado)}" DESQ. (number in red #F85149) | "${formatNumber(m.nao_assinou)}" N/ASSINOU

SALES FUNNEL below metrics, with a small "Funil de Vendas" title in gray:
Five horizontal bars stacked vertically, each decreasing in width to form a funnel shape.
Each bar shows the stage name on the left and the count plus percentage on the right.
- "SDR: ${formatNumber(m.sdr)}" widest bar, blue #2563EB (${funnelPercent(m.sdr, total)})
- "Closer: ${formatNumber(m.closer)}" narrower, teal #0EA5E9 (${funnelPercent(m.closer, total)})
- "Contrato: ${formatNumber(m.contrato)}" medium, purple #8B5CF6 (${funnelPercent(m.contrato, total)})
- "Assinatura: ${formatNumber(m.assinatura)}" narrower, orange #F59E0B (${funnelPercent(m.assinatura, total)})
- "Assinado: ${formatNumber(m.assinado)}" narrowest, green #00BC33 (${funnelPercent(m.assinado, total)})

FOOTER: "lawchat.com.br" centered, small dark gray text.

STYLE RULES:
- Clean sans-serif font
- All text sharp and crisp
- Generous whitespace between all sections
- NO illustrations, NO decorative elements, NO gradients on cards
- Numbers must be large and instantly readable
- Professional dark dashboard aesthetic
- Do NOT write any measurement numbers, guides, or annotations`;
}

/* ───────── Complete report prompt (all periods) ───────── */

function buildCompleteReportPrompt(
  clientName: string,
  date: string,
  allMetrics: Record<string, Metrics>,
  logoUrl: string,
): string {
  const sections = ALL_PERIODS.map((p) => {
    const m = allMetrics[p];
    const label = PERIOD_LABELS[p];
    return `SECTION "${label}" (Conv: ${formatRate(m.conversion_rate)}%):
  Metrics: "${formatNumber(m.total_leads)}" Leads | "${formatNumber(m.sdr)}" SDR | "${formatNumber(m.closer)}" Closer | "${formatNumber(m.contrato)}" Contrato | "${formatNumber(m.assinatura)}" Assin. | "${formatNumber(m.assinado)}" Assinados(green) | "${formatNumber(m.desqualificado)}" Desq.(red) | "${formatNumber(m.nao_assinou)}" N/Assinou`;
  }).join("\n\n");

  return `Generate a tall dark-themed professional analytics report image with ALL time periods stacked vertically (800 wide, 1400 tall).

IMPORTANT: Do NOT render any pixel measurements, guidelines, annotations, wireframe labels, or technical references anywhere in the image. This is a polished final deliverable.

LOGO: Place the logo from this URL at the top-left corner: ${logoUrl}
If you cannot load the URL, write "⚖️ LawChat" in bright green #00BC33 as fallback text.

CANVAS: Dark background #0D1117, rounded corners, subtle border #1B2130.

TOP ACCENT: Thin gradient bar from #00BC33 to #00D639 at the top, full width.

HEADER with comfortable margins:
- Logo top-left, small
- Title right of logo: "Relatório Completo — ${clientName}" in white, bold
- Date below title: "${date}" in gray

DIVIDER: Thin line #21262D below header.

BODY: 5 sections stacked vertically with generous vertical spacing between each.

Each section layout:
- Section header: Period name in green #00BC33, bold, left-aligned. Right side: green pill badge with conversion rate
- Below header: 8 metric cards in a single horizontal row, evenly distributed
  - Card style: dark rounded rectangle #161B22, subtle border
  - Number: centered, large bold white text
  - Label: centered below, small uppercase gray text
  - Assinados number in green with checkmark, Desqualificados number in red #F85149
- Thin separator line between sections except after the last one

${sections}

FOOTER: "lawchat.com.br" centered, small dark gray text.

STYLE RULES:
- Clean sans-serif font
- All text sharp and crisp, no blur
- Generous breathing room between sections, each period block should feel distinct
- Cards perfectly aligned with equal widths
- Numbers large and instantly readable
- Consistent comfortable margins throughout
- NO illustrations, NO decorative elements, NO background textures
- Professional dark dashboard aesthetic
- Do NOT write any measurement numbers, guides, or annotations`;
}

/* ───────── AI Gateway image generation ───────── */

async function generateReportImage(prompt: string, logoUrl: string): Promise<string | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.log("LOVABLE_API_KEY not set, skipping image generation");
    return null;
  }

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: logoUrl } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      console.log("AI gateway error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    return imageUrl || null;
  } catch (err) {
    console.log("Image generation failed:", err);
    return null;
  }
}

/* ───────── Z-API helpers ───────── */

async function sendZapiText(config: any, phone: string, message: string) {
  const url = `https://api.z-api.io/instances/${config.instance_id}/token/${config.instance_token}/send-text`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Client-Token": config.client_token },
    body: JSON.stringify({ phone, message }),
  });
  return { status: res.status, response: await res.json() };
}

async function sendZapiImage(config: any, phone: string, imageDataUrl: string, caption: string) {
  const url = `https://api.z-api.io/instances/${config.instance_id}/token/${config.instance_token}/send-image`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Client-Token": config.client_token },
    body: JSON.stringify({ phone, image: imageDataUrl, caption }),
  });
  return { status: res.status, response: await res.json() };
}

/* ───────── Text message builder (fallback padronizado) ───────── */

function buildStandardTextMessage(clientName: string, date: string, periodLabel: string, m: Metrics): string {
  return `📊 *Relatório ${periodLabel} — ${clientName}*
📅 ${date}

📌 *Resumo do Funil:*
• Total de Leads: ${formatNumber(m.total_leads)}
• 📞 SDR: ${formatNumber(m.sdr)}
• 🛒 Closer: ${formatNumber(m.closer)}
• 📄 Contrato: ${formatNumber(m.contrato)}
• ✍️ Assinatura: ${formatNumber(m.assinatura)}
• ✅ Assinados: ${formatNumber(m.assinado)}
• ❌ Desqualificados: ${formatNumber(m.desqualificado)}
• ⚠️ Não Assinou: ${formatNumber(m.nao_assinou)}
• 📈 Taxa de Conversão: ${formatRate(m.conversion_rate)}%

_lawchat.com.br • Relatório gerado automaticamente_`;
}

function buildCompleteTextFallback(clientName: string, date: string, allMetrics: Record<string, Metrics>): string {
  let msg = `📊 *Relatório Completo — ${clientName}*\n📅 ${date}\n`;
  for (const p of ALL_PERIODS) {
    const m = allMetrics[p];
    const label = PERIOD_LABELS[p];
    msg += `\n━━━ *${label}* (Conv: ${formatRate(m.conversion_rate)}%) ━━━\n`;
    msg += `• Total: ${formatNumber(m.total_leads)} | 📞 SDR: ${formatNumber(m.sdr)} | 🛒 Closer: ${formatNumber(m.closer)}\n`;
    msg += `• 📄 Contrato: ${formatNumber(m.contrato)} | ✍️ Assinatura: ${formatNumber(m.assinatura)}\n`;
    msg += `• ✅ Assinados: ${formatNumber(m.assinado)} | ❌ Desq: ${formatNumber(m.desqualificado)} | ⚠️ N/Assinou: ${formatNumber(m.nao_assinou)}\n`;
  }
  msg += `\n_lawchat.com.br • Relatório gerado automaticamente_`;
  return msg;
}

/* ───────── Fetch metrics for a single period ───────── */

async function fetchMetrics(sb: any, clientId: string, period: string): Promise<Metrics> {
  await sb.rpc("compute_client_metrics", { p_client_id: clientId, p_period: period });

  const { data: metrics } = await sb
    .from("client_metrics_cache")
    .select("*")
    .eq("client_id", clientId)
    .eq("period", period)
    .single();

  return sanitizeMetrics(metrics);
}

/* ───────── Main handler ───────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const isTest = body.test === true;
    const testPhone = body.testPhone as string | undefined;
    const testPeriod = (body.testPeriod as string) || "today";

    const logoUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/assets/lawchat-logo.png`;

    // Fetch global Z-API config
    const { data: globalCfg, error: cfgErr } = await sb
      .from("zapi_config")
      .select("*")
      .is("client_id", null)
      .eq("enabled", true)
      .maybeSingle();

    if (cfgErr) throw cfgErr;
    if (!globalCfg) {
      return new Response(
        JSON.stringify({ message: "No active global Z-API config found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const results: any[] = [];
    const now = new Date();
    const brasiliaOffset = -3;
    const brasiliaTime = new Date(now.getTime() + brasiliaOffset * 60 * 60 * 1000);
    const dateStr = `${brasiliaTime.getUTCDate().toString().padStart(2, "0")}/${(brasiliaTime.getUTCMonth() + 1).toString().padStart(2, "0")}/${brasiliaTime.getUTCFullYear()}`;

    /* ── Process & send report for one client+phone ── */
    async function processAndSend(
      clientId: string,
      clientName: string,
      phone: string,
      period: string,
      isTestMode: boolean,
    ) {
      // Validar período
      const validPeriods = [...ALL_PERIODS, "complete"];
      if (!validPeriods.includes(period)) {
        console.log(`Invalid period "${period}", defaulting to "today"`);
        period = "today";
      }

      const isComplete = period === "complete";

      if (isComplete) {
        const allMetrics: Record<string, Metrics> = {};
        for (const p of ALL_PERIODS) {
          allMetrics[p] = await fetchMetrics(sb, clientId, p);
          const { warnings } = validateMetrics(allMetrics[p]);
          if (warnings.length > 0) {
            console.log(`Validation warnings for ${clientName} [${p}]:`, warnings);
          }
        }

        const caption = isTestMode
          ? `🧪 TESTE — Relatório Completo — ${clientName}`
          : `📊 Relatório Completo — ${clientName}`;

        const prompt = buildCompleteReportPrompt(clientName, dateStr, allMetrics, logoUrl);
        const imageDataUrl = await generateReportImage(prompt, logoUrl);

        if (imageDataUrl) {
          try {
            return await sendZapiImage(globalCfg, phone, imageDataUrl, caption);
          } catch (imgErr) {
            console.log("Image send failed, falling back to text:", imgErr);
          }
        }

        let message = buildCompleteTextFallback(clientName, dateStr, allMetrics);
        if (isTestMode) message = "🧪 *TESTE* 🧪\n\n" + message;
        return await sendZapiText(globalCfg, phone, message);
      }

      // Single period
      const m = await fetchMetrics(sb, clientId, period);
      const { warnings } = validateMetrics(m);
      if (warnings.length > 0) {
        console.log(`Validation warnings for ${clientName} [${period}]:`, warnings);
      }

      const periodLabel = PERIOD_LABELS[period] || period;
      const caption = isTestMode
        ? `🧪 TESTE — Relatório ${periodLabel} — ${clientName}`
        : `📊 Relatório ${periodLabel} — ${clientName}`;

      const prompt = buildReportPrompt(clientName, dateStr, periodLabel, m, logoUrl);
      const imageDataUrl = await generateReportImage(prompt, logoUrl);

      if (imageDataUrl) {
        try {
          return await sendZapiImage(globalCfg, phone, imageDataUrl, caption);
        } catch (imgErr) {
          console.log("Image send failed, falling back to text:", imgErr);
        }
      }

      // Fallback: texto padronizado (ignora template customizado para consistência)
      let message = buildStandardTextMessage(clientName, dateStr, periodLabel, m);
      if (isTestMode) message = "🧪 *TESTE* 🧪\n\n" + message;
      return await sendZapiText(globalCfg, phone, message);
    }

    /* ── TEST MODE ── */
    if (isTest && testPhone) {
      // Usar clientId do body se disponível, senão buscar um ativo
      let targetClient: { id: string; name: string } | null = null;

      if (body.clientId) {
        const { data } = await sb
          .from("clients")
          .select("id, name")
          .eq("id", body.clientId)
          .eq("active", true)
          .maybeSingle();
        targetClient = data;
      }

      if (!targetClient) {
        const { data } = await sb
          .from("clients")
          .select("id, name")
          .eq("active", true)
          .limit(1)
          .maybeSingle();
        targetClient = data;
      }

      if (targetClient) {
        try {
          const result = await processAndSend(targetClient.id, targetClient.name, testPhone, testPeriod, true);
          results.push({ phone: testPhone, period: testPeriod, ...result });
        } catch (e: any) {
          results.push({ phone: testPhone, error: e.message });
        }
      } else {
        results.push({ phone: testPhone, error: "No active client found" });
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── NORMAL FLOW: all active clients ── */
    const brasiliaHour = (now.getUTCHours() + 24 + brasiliaOffset) % 24;
    const currentHourStr = brasiliaHour.toString().padStart(2, "0") + ":00";

    const { data: clients } = await sb.from("clients").select("id, name").eq("active", true);

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active clients found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    for (const client of clients) {
      const { data: phones } = await sb
        .from("notification_settings")
        .select("*")
        .eq("client_id", client.id)
        .eq("enabled", true);

      if (!phones || phones.length === 0) continue;

      for (const phoneRow of phones) {
        const configuredTime = (phoneRow as any).report_time || "08:00";
        if (configuredTime !== currentHourStr) continue;

        const periodStr = (phoneRow as any).report_period || "today";
        const periods = periodStr.split(",").map((p: string) => p.trim()).filter(Boolean);

        for (const period of periods) {
          try {
            const result = await processAndSend(client.id, client.name, phoneRow.phone, period, false);
            results.push({ client: client.name, phone: phoneRow.phone, period, ...result });
          } catch (e: any) {
            results.push({ client: client.name, phone: phoneRow.phone, period, error: e.message });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
