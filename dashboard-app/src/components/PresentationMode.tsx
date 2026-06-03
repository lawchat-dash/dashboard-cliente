import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { motion } from 'framer-motion';
import AnimatedCounter from '@/components/AnimatedCounter';
import {
  MonitorPlay, X, Users, FileCheck, Percent, TrendingUp, TrendingDown, UserCheck, Search,
  FileText, PenLine, Trophy, Check, UserPlus, UserX, Megaphone, Clock, CalendarDays,
  Sparkles, Target, ChevronRight, Activity, Radio, AlertTriangle,
} from 'lucide-react';

interface PresentationModeProps {
  cards: Card[];
  sessions: Session[];
  clientName?: string;
}

const DAY = 86400000;
const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const FUNNEL = [
  { key: 'SDR', label: 'SDR', icon: Users, color: '#3b82f6' },
  { key: 'CLOSER', label: 'Closer', icon: UserCheck, color: '#06b6d4' },
  { key: 'ANALISE MANUAL', label: 'Análise Manual', icon: Search, color: '#a855f7' },
  { key: 'CONTRATO', label: 'Confecção', icon: FileText, color: '#f59e0b' },
  { key: 'ETAPA DE ASSINATURA', label: 'Aguardando', icon: PenLine, color: '#22c55e' },
  { key: 'CONTRATO FECHADO', label: 'Assinado', icon: Trophy, color: '#16a34a' },
];

const DONUT_META: Record<string, { label: string; color: string }> = {
  'SDR': { label: 'SDR', color: '#3b82f6' },
  'CLOSER': { label: 'Closer', color: '#06b6d4' },
  'ANALISE MANUAL': { label: 'Análise Manual', color: '#a855f7' },
  'CONTRATO': { label: 'Confecção', color: '#f59e0b' },
  'ETAPA DE ASSINATURA': { label: 'Aguardando', color: '#22c55e' },
  'CONTRATO FECHADO': { label: 'Contrato Assinado', color: '#16a34a' },
};

function classifySource(utm: string | null | undefined): string {
  const s = (utm || '').toUpperCase();
  if (s.includes('INSTAGRAM')) return 'Instagram';
  if (s.includes('FACEBOOK') || s.includes('META')) return 'Facebook Ads';
  if (s.includes('GOOGLE')) return 'Google Ads';
  if (s.includes('YOUTUBE')) return 'YouTube';
  if (s.includes('INDICA') || s.includes('REFER')) return 'Indicação';
  if (s) return 'Outro';
  return 'Direto';
}
function nameOf(c: Card): string {
  const t = c.contacts?.[0]?.name || '';
  if (t) return t;
  const m = (c.title || '').match(/👤\s*([^|]+)/);
  let s = (m ? m[1] : (c.title || '').split(/[|]|\s[-–]\s/)[0] || '').replace(/[^\w\sÀ-ÿ.-]/g, '').trim();
  s = s.replace(/^(ia\s+cliente|cliente|ia)\s+/i, '').trim();
  if (s && s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|\s)([a-zà-ÿ])/g, (_, p, x) => p + x.toUpperCase());
  return s || 'Lead';
}
function ago(ms: number): string {
  const d = Date.now() - ms;
  const m = Math.floor(d / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function Spark({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return <svg width={92} height={36} />;
  const max = Math.max(...data, 1); const w = 92, h = 36, step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - (v / max) * (h - 6) - 3]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const fill = `${line} L${w},${h} L0,${h} Z`;
  const gid = `sp-${color.replace('#', '')}`;
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.35" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={fill} fill={`url(#${gid})`} />
      <motion.path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 1px 2px ${color}44)` }}
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
    </svg>
  );
}

// KPI card premium: glassmorphism + glow que segue o cursor + hover 3D.
const KpiCard = ({ k, i }: { k: any; i: number }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const up = k.delta >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: i * 0.08, duration: 0.5 }}
      whileHover={{ y: -8, scale: 1.02 }}
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
      onMouseLeave={() => setPos(null)}
      className="group relative overflow-hidden rounded-3xl border bg-white/70 backdrop-blur-xl p-5 shadow-[0_10px_36px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_28px_70px_-22px_rgba(15,23,42,0.20)]"
      style={{ borderColor: `${k.color}2e` }}
    >
      {pos && <div className="pointer-events-none absolute h-44 w-44 rounded-full blur-2xl" style={{ left: pos.x - 88, top: pos.y - 88, background: `radial-gradient(circle, ${k.color}24, transparent 70%)` }} />}
      <div className="absolute -top-16 -right-16 h-36 w-36 rounded-full blur-3xl" style={{ background: `${k.color}14` }} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${k.color}22`, border: `1px solid ${k.color}44` }}><k.icon className="h-4 w-4" style={{ color: k.color }} /></div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{k.label}</span>
          </div>
          <p className="text-[44px] leading-none font-extrabold tracking-tight tabular-nums" style={{ color: k.color }}>
            <AnimatedCounter value={k.value} decimals={k.decimals} suffix={k.suffix || ''} duration={1500} />
          </p>
          <p className={`mt-2 flex items-center gap-1 text-[11px] font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? '↑' : '↓'} {Math.abs(k.delta).toFixed(1)}{k.pp ? ' p.p.' : '%'} <span className="font-normal text-slate-400">vs período anterior</span>
          </p>
        </div>
        <div className="mt-1"><Spark data={k.spark} color={k.color} /></div>
      </div>
    </motion.div>
  );
};

// IMPORTANTE: definido FORA do componente. Se ficasse dentro, cada render (o relógio
// re-renderiza a cada 1s) criaria um novo tipo de componente → React remontava TODOS
// os painéis a cada segundo → animações/contadores reiniciavam sem parar (o "loop").
const Panel = ({ title, icon: Icon, iconColor, right, children, className = '' }: any) => (
  <div className={`relative rounded-2xl border border-white/70 bg-white/60 backdrop-blur-2xl p-4 shadow-[0_8px_36px_rgba(15,23,42,0.07)] ${className}`}>
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4" style={{ color: iconColor }} />}
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      </div>
      {right}
    </div>
    {children}
  </div>
);

const PresentationMode = ({ cards, sessions, clientName }: PresentationModeProps) => {
  const { classify } = useClassify();
  const [active, setActive] = useState(false);
  const [clock, setClock] = useState('');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!active) return;
    const tick = () => setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(false); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const d = useMemo(() => {
    const now = Date.now();
    const valid = cards.filter(c => !c.archived);
    const stageCounts: Record<string, number> = {};
    valid.forEach(c => { const s = classify(c); stageCounts[s] = (stageCounts[s] || 0) + 1; });
    const total = valid.length;
    const closed = stageCounts['CONTRATO FECHADO'] || 0;
    const conv = total ? (closed / total) * 100 : 0;
    const neg = (stageCounts['CLOSER'] || 0) + (stageCounts['CONTRATO'] || 0) + (stageCounts['ETAPA DE ASSINATURA'] || 0) + (stageCounts['ANALISE MANUAL'] || 0);

    const created = valid.map(c => new Date(c.createdAt).getTime()).filter(t => !isNaN(t));
    const closedCards = valid.filter(c => classify(c) === 'CONTRATO FECHADO');
    const closedTimes = closedCards.map(c => new Date((c as any).contractNote?.createdAt || c.updatedAt).getTime()).filter(t => !isNaN(t));

    const cnt = (arr: number[], s: number, e: number) => arr.filter(t => t >= s && t < e).length;
    const leadsCur = cnt(created, now - 30 * DAY, now + DAY), leadsPrev = cnt(created, now - 60 * DAY, now - 30 * DAY);
    const closedCur = cnt(closedTimes, now - 30 * DAY, now + DAY), closedPrev = cnt(closedTimes, now - 60 * DAY, now - 30 * DAY);
    const convCur = leadsCur ? (closedCur / leadsCur) * 100 : 0, convPrev = leadsPrev ? (closedPrev / leadsPrev) * 100 : 0;
    const delta = (c: number, p: number) => (p > 0 ? ((c - p) / p) * 100 : (c > 0 ? 100 : 0));

    const wb = (times: number[]) => { const wk = 7 * DAY, n = 8, a = new Array(n).fill(0); times.forEach(t => { const i = n - 1 - Math.floor((now - t) / wk); if (i >= 0 && i < n) a[i]++; }); return a; };
    const sparkLeads = wb(created), sparkClosed = wb(closedTimes);

    // série diária (30d) p/ Evolução
    const days = 30; const daily = new Array(days).fill(0); const labels: number[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < days; i++) labels.push(today.getTime() - (days - 1 - i) * DAY);
    created.forEach(t => { const i = days - 1 - Math.floor((now - t) / DAY); if (i >= 0 && i < days) daily[i]++; });
    const dailyTotal = daily.reduce((a, b) => a + b, 0);
    const avgDay = dailyTotal / days;
    let maxI = 0, minI = 0; daily.forEach((v, i) => { if (v > daily[maxI]) maxI = i; if (v < daily[minI]) minI = i; });

    // funil 6 etapas + trend (inflow 30d vs prev)
    const stageCreated = (key: string, s: number, e: number) => valid.filter(c => classify(c) === key && (() => { const t = new Date(c.createdAt).getTime(); return t >= s && t < e; })()).length;
    const funnel = FUNNEL.map(f => {
      const c30 = stageCreated(f.key, now - 30 * DAY, now + DAY), p30 = stageCreated(f.key, now - 60 * DAY, now - 30 * DAY);
      return { ...f, count: stageCounts[f.key] || 0, pct: total ? ((stageCounts[f.key] || 0) / total) * 100 : 0, trend: delta(c30, p30) };
    });

    // donut por etapa (funil)
    const donutSegs = Object.keys(DONUT_META).map(k => ({ key: k, ...DONUT_META[k], count: stageCounts[k] || 0 })).filter(s => s.count > 0);
    const donutTotal = donutSegs.reduce((a, b) => a + b.count, 0) || 1;

    // top origens
    const src: Record<string, number> = {};
    sessions.forEach(s => { if (s.utmSource && (s.utmSourceId || s.utmCampaign)) { const k = classifySource(s.utmSource); src[k] = (src[k] || 0) + 1; } });
    const topSources = Object.entries(src).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const srcTotal = Object.values(src).reduce((a, b) => a + b, 0) || 1;

    // weekday / hora pico
    const wd = new Array(7).fill(0); created.forEach(t => wd[new Date(t).getDay()]++);
    let bestWd = 0; wd.forEach((v, i) => { if (v > wd[bestWd]) bestWd = i; });
    const hr = new Array(24).fill(0); created.forEach(t => hr[new Date(t).getHours()]++);
    let peakHr = 0; hr.forEach((v, i) => { if (v > hr[peakHr]) peakHr = i; });
    const hrPct = dailyTotal ? Math.round((hr[peakHr] / Math.max(1, created.length)) * 100) : 0;

    // meta mensal
    const mk = `sales-goal-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    let goal = 20; try { const st = localStorage.getItem(mk); if (st) goal = parseInt(st, 10); } catch {}
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
    const closedMonth = closedTimes.filter(t => t >= monthStart).length;
    const goalPct = goal ? Math.min(100, Math.round((closedMonth / goal) * 100)) : 0;

    // feed ao vivo (eventos reais recentes)
    type Ev = { t: number; type: 'success' | 'blue' | 'red' | 'purple'; icon: any; title: string; sub: string };
    const feed: Ev[] = [];
    closedCards.slice().sort((a, b) => new Date((b as any).contractNote?.createdAt || b.updatedAt).getTime() - new Date((a as any).contractNote?.createdAt || a.updatedAt).getTime()).slice(0, 5)
      .forEach(c => feed.push({ t: new Date((c as any).contractNote?.createdAt || c.updatedAt).getTime(), type: 'success', icon: Check, title: 'Contrato assinado', sub: nameOf(c) }));
    valid.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
      .forEach(c => feed.push({ t: new Date(c.createdAt).getTime(), type: 'blue', icon: UserPlus, title: 'Novo lead', sub: nameOf(c) }));
    valid.filter(c => classify(c) === 'DESQUALIFICADO').slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3)
      .forEach(c => feed.push({ t: new Date(c.updatedAt).getTime(), type: 'red', icon: UserX, title: 'Lead desqualificado', sub: nameOf(c) }));
    const feedSorted = feed.sort((a, b) => b.t - a.t).slice(0, 6);

    // ─────────── IA: gargalo, previsão, melhor origem (tudo dos dados reais) ───────────
    // Alcance cumulativo por etapa (quem chegou ÀquELA etapa ou além) → conversão real.
    const cumReach = FUNNEL.map((_, i) => FUNNEL.slice(i).reduce((a, f) => a + (stageCounts[f.key] || 0), 0));
    const stageConv = FUNNEL.map((_, i) => (i === 0 ? 100 : cumReach[i - 1] > 0 ? (cumReach[i] / cumReach[i - 1]) * 100 : 0));
    // Gargalo = transição com a PIOR conversão (onde mais leads "travam"), com volume mínimo.
    let bnIdx = -1, bnWorst = 101;
    for (let i = 1; i < FUNNEL.length; i++) { if (cumReach[i - 1] >= 20 && stageConv[i] < bnWorst) { bnWorst = stageConv[i]; bnIdx = i; } }
    const bottleneck = bnIdx >= 1 ? { stage: FUNNEL[bnIdx - 1].label, conv: Math.round(bnWorst), stuck: stageCounts[FUNNEL[bnIdx - 1].key] || 0 } : null;

    // Previsão: ritmo de fechamento dos últimos 7d projetado p/ ~5 dias úteis.
    const closed7 = cnt(closedTimes, now - 7 * DAY, now + DAY);
    const predict = Math.max(0, Math.round((closed7 / 7) * 5));

    // Melhor origem por CONVERSÃO (lead→contrato), dedup por card, volume mínimo.
    const closedIds = new Set(closedCards.map(c => c.id));
    const sld: Record<string, number> = {}, scl: Record<string, number> = {}, seenC = new Set<string>();
    sessions.forEach(s => {
      if (!s.cardId || seenC.has(s.cardId)) return;
      if (s.utmSource && (s.utmSourceId || s.utmCampaign)) {
        seenC.add(s.cardId);
        const k = classifySource(s.utmSource);
        sld[k] = (sld[k] || 0) + 1;
        if (closedIds.has(s.cardId)) scl[k] = (scl[k] || 0) + 1;
      }
    });
    const srcConvByName: Record<string, number> = {};
    Object.keys(sld).forEach(k => { srcConvByName[k] = sld[k] > 0 ? ((scl[k] || 0) / sld[k]) * 100 : 0; });
    let bestSrc: string | null = null, bestCv = 0;
    Object.keys(sld).forEach(k => { if (sld[k] >= 30) { const cv = (scl[k] || 0) / sld[k]; if (cv > bestCv) { bestCv = cv; bestSrc = k; } } });
    const overallCv = total ? closed / total : 0;
    const bestSrcLift = bestSrc && overallCv > 0 ? Math.round((bestCv / overallCv - 1) * 100) : 0;

    return {
      total, closed, conv, neg,
      kpis: [
        { label: 'Total de Leads', value: total, icon: Users, color: '#3b82f6', spark: sparkLeads, delta: delta(leadsCur, leadsPrev), decimals: 0 },
        { label: 'Contratos Assinados', value: closed, icon: FileCheck, color: '#22c55e', spark: sparkClosed, delta: delta(closedCur, closedPrev), decimals: 0 },
        { label: 'Taxa de Conversão', value: conv, icon: Percent, color: '#a855f7', spark: sparkClosed, delta: convCur - convPrev, decimals: 1, suffix: '%', pp: true },
        { label: 'Em Negociação', value: neg, icon: TrendingUp, color: '#f59e0b', spark: sparkLeads, delta: delta(leadsCur, leadsPrev), decimals: 0 },
      ],
      funnel, daily, labels, dailyTotal, avgDay, maxI, minI,
      donutSegs, donutTotal, topSources, srcTotal,
      bestWd, peakHr, hrPct, goalPct, closedMonth, goal, convDeltaPP: convCur - convPrev,
      feed: feedSorted,
      stageConv, bottleneck, predict, bestSrc, bestSrcLift, srcConvByName,
    };
  }, [cards, sessions, classify]);

  // gráfico de evolução (geometria)
  const chart = useMemo(() => {
    const W = 560, H = 150, padL = 26, padR = 12, padT = 12, padB = 22;
    const s = d.daily; const max = Math.max(...s, 1);
    const x = (i: number) => padL + (s.length <= 1 ? 0 : (i / (s.length - 1)) * (W - padL - padR));
    const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
    const pts = s.map((v, i) => [x(i), y(v)]);
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const fill = `${line} L${x(s.length - 1)},${H - padB} L${padL},${H - padB} Z`;
    return { W, H, padL, padR, padT, padB, x, y, pts, line, fill, max };
  }, [d.daily]);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * chart.W;
    const rel = (px - chart.padL) / (chart.W - chart.padL - chart.padR);
    const idx = Math.round(rel * (d.daily.length - 1));
    if (idx >= 0 && idx < d.daily.length) setHoverIdx(idx);
  };

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="fixed bottom-[4.75rem] right-5 z-40 hidden md:flex items-center gap-2 rounded-full border border-border/60 bg-card/90 backdrop-blur px-4 py-2.5 text-xs text-muted-foreground shadow-lg hover:text-foreground hover:shadow-xl transition-all print:hidden"
        title="Modo TV / NOC"
      >
        <MonitorPlay className="h-3.5 w-3.5" /> Modo TV
      </button>
    );
  }

  const hov = hoverIdx != null ? d.daily[hoverIdx] : null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      {/* fundo premium — profundidade por glows ESTÁTICOS (não se mexem) +
          grid fino + granulado sutil; é o que faz o glassmorphism "aparecer". */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[46vh] w-[46vh] rounded-full blur-[150px]" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.14), transparent 70%)' }} />
        <div className="absolute top-1/4 -right-32 h-[44vh] w-[44vh] rounded-full blur-[150px]" style={{ background: 'radial-gradient(circle, rgba(16,191,65,0.12), transparent 70%)' }} />
        <div className="absolute -bottom-40 left-1/3 h-[42vh] w-[42vh] rounded-full blur-[150px]" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.10), transparent 70%)' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(15,23,42,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.02) 1px,transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="absolute inset-0 opacity-[0.03] mix-blend-multiply" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      </div>

      {/* header */}
      <div className="relative flex items-center justify-between px-7 py-4 shrink-0 border-b border-slate-200">
        <div className="flex items-center gap-3.5">
          <img src="/lawchat-logo-light-bg.png" alt="LawChat" className="h-9 w-auto object-contain" />
          <div>
            <p className="text-xl font-bold leading-none tracking-tight">{clientName || 'LawChat'}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-600">Ao vivo</span>
              <span className="text-[11px] text-slate-400">· Visão Geral · {d.total.toLocaleString('pt-BR')} leads</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <span className="block text-2xl font-bold tabular-nums tracking-wider leading-none">{clock}</span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-400 mt-1">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
          </div>
          <button onClick={() => setActive(false)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors" title="Sair (Esc)"><X className="h-5 w-5" /></button>
        </div>
      </div>

      {/* conteúdo */}
      <div className="relative flex-1 overflow-y-auto px-7 py-5 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {d.kpis.map((k, i) => <KpiCard key={k.label} k={k} i={i} />)}
        </div>

        {/* Funil (2/3) + Atividade (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel title="Fluxo do Funil" icon={Activity} iconColor="#3b82f6" className="lg:col-span-2">
            <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
              {d.funnel.map((f, i) => {
                const up = f.trend >= 0;
                const isBn = d.bottleneck && f.label === d.bottleneck.stage;
                const convNext = d.stageConv[i + 1];
                return (
                  <div key={f.key} className="flex items-center gap-1 flex-1 min-w-0">
                    <motion.div initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: i * 0.09 }}
                      whileHover={{ y: -4 }}
                      className="group relative flex-1 rounded-xl border bg-white/70 px-2.5 py-3 text-center min-w-[92px] transition-shadow hover:shadow-md"
                      style={{ borderColor: isBn ? '#f59e0b' : 'rgb(226 232 240)', boxShadow: isBn ? '0 0 0 1px rgba(245,158,11,0.4), 0 10px 26px -10px rgba(245,158,11,0.55)' : undefined }}>
                      {isBn && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow">Gargalo</span>}
                      <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg transition-transform group-hover:scale-110" style={{ background: `${f.color}14`, border: `1px solid ${f.color}33`, boxShadow: `0 4px 12px -5px ${f.color}66` }}>
                        <f.icon className="h-4 w-4" style={{ color: f.color }} />
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">{f.label}</p>
                      <p className="text-xl font-bold tabular-nums leading-tight" style={{ color: f.color }}>{f.count.toLocaleString('pt-BR')}</p>
                      <p className={`text-[10px] font-medium ${up ? 'text-emerald-600' : 'text-red-500'}`}>{up ? '↑' : '↓'} {Math.abs(f.trend).toFixed(1)}%</p>
                    </motion.div>
                    {i < d.funnel.length - 1 && (
                      <div className="flex flex-col items-center shrink-0 px-0.5">
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                        {convNext != null && <span className="text-[8px] font-semibold tabular-nums text-slate-400">{Math.round(convNext)}%</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* IA do funil: gargalo, previsão e melhor origem — calculados dos dados */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {d.bottleneck ? (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-slate-600 leading-snug">Gargalo em <strong className="text-slate-800">{d.bottleneck.stage}</strong> — só {d.bottleneck.conv}% avançam ({d.bottleneck.stuck.toLocaleString('pt-BR')} parados).</p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5">
                  <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-slate-600 leading-snug">Funil saudável, sem gargalo crítico no momento.</p>
                </div>
              )}
              <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50/70 p-2.5">
                <TrendingUp className="h-3.5 w-3.5 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-[11px] text-slate-600 leading-snug">Previsão: <strong className="text-slate-800">+{d.predict} contratos</strong> nos próximos dias úteis.</p>
              </div>
              {d.bestSrc && d.bestSrcLift > 0 ? (
                <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50/70 p-2.5">
                  <Sparkles className="h-3.5 w-3.5 text-violet-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-slate-600 leading-snug">Leads de <strong className="text-slate-800">{d.bestSrc}</strong> convertem <strong className="text-slate-800">{d.bestSrcLift}%</strong> melhor que a média.</p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                  <Sparkles className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-slate-500 leading-snug">Analisando conversão por origem…</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Atividade em Tempo Real" icon={Radio} iconColor="#22c55e" right={<span className="text-[10px] text-emerald-600 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />stream</span>}>
            <div className="space-y-2.5">
              {d.feed.length === 0 ? <p className="text-xs text-slate-400 py-4 text-center">Sem atividade recente.</p> : d.feed.map((ev, i) => {
                const tone = ev.type === 'success' ? '#22c55e' : ev.type === 'blue' ? '#3b82f6' : ev.type === 'red' ? '#ef4444' : '#a855f7';
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }} className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ background: `${tone}1f`, border: `1px solid ${tone}3a` }}><ev.icon className="h-3.5 w-3.5" style={{ color: tone }} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800 truncate">{ev.title}</p>
                      <p className="text-[10px] text-slate-500 truncate">{ev.sub}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">{ago(ev.t)}</span>
                  </motion.div>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* Evolução + Distribuição + Top Origens */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Evolução */}
          <Panel title="Evolução de Leads" icon={TrendingUp} iconColor="#3b82f6" right={<span className="text-[10px] text-slate-400">últimos 30 dias</span>}>
            <div className="relative">
              <svg ref={svgRef} viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full" style={{ height: 150, cursor: 'crosshair' }} onMouseMove={handleMove} onMouseLeave={() => setHoverIdx(null)}>
                <defs><linearGradient id="evo-noc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity="0.32" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0" /></linearGradient></defs>
                <path d={chart.fill} fill="url(#evo-noc)" />
                <motion.path d={chart.line} fill="none" stroke="#3b82f6" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 3px rgba(59,130,246,.3))' }} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
                {hoverIdx != null && hov != null && (<g><line x1={chart.x(hoverIdx)} y1={chart.padT} x2={chart.x(hoverIdx)} y2={chart.H - chart.padB} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} /><circle cx={chart.x(hoverIdx)} cy={chart.y(hov)} r={4} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} /></g>)}
              </svg>
              {hoverIdx != null && hov != null && (
                <div className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-xl whitespace-nowrap" style={{ left: `${Math.max(8, Math.min(88, (chart.x(hoverIdx) / chart.W) * 100))}%`, top: 4, transform: 'translateX(-50%)' }}>
                  <p className="text-[10px] text-slate-500">{new Date(d.labels[hoverIdx]).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</p>
                  <p className="text-sm font-bold text-blue-600">{hov} <span className="text-[10px] font-normal text-slate-500">leads</span></p>
                </div>
              )}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 border-t border-slate-200 pt-2.5">
              {[{ l: 'Total', v: d.dailyTotal.toLocaleString('pt-BR') }, { l: 'Média/dia', v: d.avgDay.toFixed(1) }, { l: 'Maior pico', v: d.daily[d.maxI] }, { l: 'Menor', v: d.daily[d.minI] }].map(s => (
                <div key={s.l}><p className="text-sm font-bold tabular-nums text-slate-800">{s.v}</p><p className="text-[9px] uppercase tracking-wide text-slate-400">{s.l}</p></div>
              ))}
            </div>
          </Panel>

          {/* Distribuição */}
          <Panel title="Distribuição dos Leads" icon={Activity} iconColor="#a855f7">
            <div className="flex items-center gap-3">
              <div className="relative h-[120px] w-[120px] shrink-0">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  {(() => { const R = 46, C = 2 * Math.PI * R; let acc = 0; return d.donutSegs.map((s, i) => { const seg = (s.count / d.donutTotal) * C; const rot = (acc / d.donutTotal) * 360; acc += s.count; return (<motion.circle key={s.key} cx={60} cy={60} r={R} fill="none" stroke={s.color} strokeWidth={12} strokeDasharray={`${seg} ${C}`} transform={`rotate(${rot} 60 60)`} style={{ filter: `drop-shadow(0 1px 2px ${s.color}55)` }} initial={{ strokeDashoffset: seg }} animate={{ strokeDashoffset: 0 }} transition={{ duration: 0.9, delay: 0.2 + i * 0.08 }} />); }); })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold leading-none"><AnimatedCounter value={d.total} /></span><span className="text-[9px] text-slate-500">Total</span></div>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                {d.donutSegs.map(s => (
                  <div key={s.key} className="flex items-center gap-2 text-[11px]"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} /><span className="flex-1 truncate text-slate-600">{s.label}</span><span className="font-semibold text-slate-800 tabular-nums">{((s.count / d.donutTotal) * 100).toFixed(1)}%</span></div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Top Origens */}
          <Panel title="Top 5 Origens de Leads" icon={Megaphone} iconColor="#3b82f6">
            {d.topSources.length === 0 ? <p className="text-xs text-slate-400 py-6 text-center">Sem dados de origem.</p> : (
              <div className="space-y-2.5">
                {d.topSources.map(([name, v], i) => (
                  <motion.div key={name} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="flex items-center gap-2.5">
                    <span className="w-4 text-[11px] font-bold text-slate-400">{i + 1}</span>
                    <span className="w-24 text-[11px] text-slate-700 truncate shrink-0">{name}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><motion.div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400" initial={{ width: 0 }} animate={{ width: `${(v / (d.topSources[0][1] || 1)) * 100}%` }} transition={{ duration: 0.9, delay: 0.1 + i * 0.08 }} /></div>
                    <span className="text-[11px] font-semibold tabular-nums text-slate-800 w-12 text-right">{v.toLocaleString('pt-BR')}</span>
                    <span className="text-[10px] tabular-nums text-slate-400 w-10 text-right">{((v / d.srcTotal) * 100).toFixed(1)}%</span>
                  </motion.div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Insights */}
        <Panel title="Insights Inteligentes" icon={Sparkles} iconColor="#a855f7">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: TrendingUp, tone: '#22c55e', t: 'Conversão', s: `${d.convDeltaPP >= 0 ? '+' : ''}${d.convDeltaPP.toFixed(1)} p.p. vs período anterior` },
              { icon: CalendarDays, tone: '#a855f7', t: 'Melhor dia', s: `${WEEKDAYS[d.bestWd]} concentra mais leads` },
              { icon: Clock, tone: '#f59e0b', t: 'Horário de pico', s: `${String(d.peakHr).padStart(2, '0')}h — ${d.hrPct}% dos leads` },
              { icon: Target, tone: '#3b82f6', t: 'Meta mensal', s: `${d.goalPct}% alcançada (${d.closedMonth}/${d.goal})` },
            ].map((ins, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ background: `${ins.tone}1f`, border: `1px solid ${ins.tone}3a` }}><ins.icon className="h-4 w-4" style={{ color: ins.tone }} /></span>
                <div className="min-w-0"><p className="text-xs font-semibold text-slate-800">{ins.t}</p><p className="text-[10px] text-slate-500 leading-snug">{ins.s}</p></div>
              </motion.div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default PresentationMode;
