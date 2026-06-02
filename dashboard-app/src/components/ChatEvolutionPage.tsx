import { useState, useMemo, useRef } from 'react';
import { Card, Session } from '@/api/helena';
import { motion } from 'framer-motion';
import AnimatedCounter from '@/components/AnimatedCounter';
import {
  MessageSquare, TrendingUp, TrendingDown, CalendarDays, Sparkles, Sun, Sunset, Moon,
  Clock, Activity, Flame, ArrowUpRight, ArrowDownRight, LineChart, AreaChart,
} from 'lucide-react';

interface ChatEvolutionPageProps {
  cards: Card[];
  sessions: Session[];
}

type RangeKey = '7d' | '30d' | '90d' | 'all';
const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: '7d', label: '7 dias', days: 7 },
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
  { key: 'all', label: 'Tudo', days: Infinity },
];

const DAY = 86400000;

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtShort(t: number): string {
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtFull(t: number): string {
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const DAYPARTS = [
  { key: 'Manhã', from: 6, to: 12, icon: Sun, color: '#f59e0b' },
  { key: 'Tarde', from: 12, to: 18, icon: Sunset, color: '#22c55e' },
  { key: 'Noite', from: 18, to: 24, icon: Moon, color: '#6366f1' },
  { key: 'Madrugada', from: 0, to: 6, icon: Clock, color: '#94a3b8' },
];

const ChatEvolutionPage = ({ cards }: ChatEvolutionPageProps) => {
  const [range, setRange] = useState<RangeKey>('30d');
  const [chartType, setChartType] = useState<'area' | 'line'>('area');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const nowMs = useMemo(() => Date.now(), []);

  const data = useMemo(() => {
    const valid = cards.filter(c => !c.archived && c.createdAt).map(c => new Date(c.createdAt).getTime()).filter(t => !isNaN(t));
    if (valid.length === 0) {
      return { series: [], total: 0, perDay: 0, best: null as null | { t: number; v: number }, trend: 0, ma: [], dayparts: [], hourly: [], cur: 0, prev: 0, growth: 0, prediction: 0, top: [], numDays: 0, peakIdxs: [] as number[] };
    }
    const maxT = Math.max(...valid);
    const cfg = RANGES.find(r => r.key === range)!;
    const minT = cfg.days === Infinity ? Math.min(...valid) : maxT - (cfg.days - 1) * DAY;

    // janela atual
    const startDay = new Date(minT); startDay.setHours(0, 0, 0, 0);
    const endDay = new Date(maxT); endDay.setHours(0, 0, 0, 0);
    const numDays = Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / DAY) + 1);

    // agrega por dia (ou por semana se a janela for muito longa)
    const weekly = numDays > 95;
    const bucketMs = weekly ? 7 * DAY : DAY;
    const nBuckets = Math.ceil((endDay.getTime() - startDay.getTime() + DAY) / bucketMs);
    const buckets = Array.from({ length: nBuckets }, (_, i) => ({ t: startDay.getTime() + i * bucketMs, v: 0 }));

    const inWindow = valid.filter(t => t >= startDay.getTime());
    inWindow.forEach(t => {
      const idx = Math.floor((t - startDay.getTime()) / bucketMs);
      if (idx >= 0 && idx < buckets.length) buckets[idx].v++;
    });

    const total = inWindow.length;
    const perDay = total / numDays;
    let best = buckets[0] || null;
    buckets.forEach(b => { if (!best || b.v > best.v) best = b; });

    // média móvel (janela 7 pontos ou 3 se semanal)
    const win = weekly ? 3 : 7;
    const ma = buckets.map((_, i) => {
      const s = Math.max(0, i - win + 1);
      const slice = buckets.slice(s, i + 1);
      return slice.reduce((a, b) => a + b.v, 0) / slice.length;
    });

    // tendência: média do último terço vs primeiro terço
    const third = Math.max(1, Math.floor(buckets.length / 3));
    const firstAvg = buckets.slice(0, third).reduce((a, b) => a + b.v, 0) / third;
    const lastAvg = buckets.slice(-third).reduce((a, b) => a + b.v, 0) / third;
    const trend = firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;

    // distribuição por período do dia
    const dpCounts = DAYPARTS.map(dp => ({ ...dp, count: 0 }));
    inWindow.forEach(t => {
      const h = new Date(t).getHours();
      const dp = DAYPARTS.find(d => h >= d.from && h < d.to) || DAYPARTS[3];
      const found = dpCounts.find(d => d.key === dp.key)!;
      found.count++;
    });

    // por hora (0-23)
    const hourly = Array.from({ length: 24 }, (_, h) => ({ h, v: 0 }));
    inWindow.forEach(t => { hourly[new Date(t).getHours()].v++; });

    // comparativo período anterior (mesma duração)
    const cur = total;
    const prevStart = startDay.getTime() - numDays * DAY;
    const prev = valid.filter(t => t >= prevStart && t < startDay.getTime()).length;
    const growth = prev > 0 ? ((cur - prev) / prev) * 100 : 0;

    // predição simples: projeta o ritmo recente para o fim do período
    const prediction = Math.round(lastAvg * (weekly ? 1 : 7)); // próx. ciclo

    // top 5 dias/buckets
    const top = [...buckets].map((b, i) => ({ ...b, i })).sort((a, b) => b.v - a.v).slice(0, 5).filter(b => b.v > 0);

    // marcadores de pico (acima de 1.5× a média)
    const peakIdxs: number[] = [];
    buckets.forEach((b, i) => { if (perDay > 0 && b.v >= perDay * 1.6 && b.v === best?.v) peakIdxs.push(i); });

    return { series: buckets, total, perDay, best, trend, ma, dayparts: dpCounts, hourly, cur, prev, growth, prediction, top, numDays, weekly, peakIdxs };
  }, [cards, range]);

  const rising = data.trend >= 0;
  const grY = (data.growth >= 0);

  // ─────────── geometria do gráfico principal ───────────
  const chart = useMemo(() => {
    const W = 1000, H = 300, padL = 34, padR = 16, padT = 16, padB = 28;
    const s = data.series;
    if (s.length === 0) return null;
    const maxV = Math.max(...s.map(b => b.v), ...data.ma, 1);
    const x = (i: number) => padL + (s.length <= 1 ? 0 : (i / (s.length - 1)) * (W - padL - padR));
    const y = (v: number) => padT + (1 - v / maxV) * (H - padT - padB);
    const linePts = s.map((b, i) => [x(i), y(b.v)]);
    const linePath = linePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${x(s.length - 1).toFixed(1)},${H - padB} L${padL},${H - padB} Z`;
    const maPath = data.ma.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    // ticks
    const yticks = [0, Math.round(maxV / 2), Math.round(maxV)].map(v => ({ v, y: y(v) }));
    const tickEvery = Math.max(1, Math.ceil(s.length / 7));
    const xticks = s.map((b, i) => ({ i, t: b.t })).filter((_, i) => i % tickEvery === 0 || i === s.length - 1);
    return { W, H, padL, padR, padT, padB, x, y, linePath, areaPath, maPath, linePts, yticks, xticks, maxV };
  }, [data]);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!chart || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * chart.W;
    const rel = (px - chart.padL) / (chart.W - chart.padL - chart.padR);
    const idx = Math.round(rel * (data.series.length - 1));
    if (idx >= 0 && idx < data.series.length) setHoverIdx(idx);
  };

  const hover = hoverIdx != null && data.series[hoverIdx] ? data.series[hoverIdx] : null;
  const hoverMA = hoverIdx != null ? data.ma[hoverIdx] : 0;

  if (data.total === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">
        Sem chats no período selecionado.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ─────────── Header ─────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Evolução de Novos Chats</h1>
            <p className="text-sm text-muted-foreground">Comportamento, tendências e sazonalidade em tempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${range === r.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─────────── KPIs ─────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total de chats', value: data.total, sub: `nos últimos ${data.numDays} dias`, icon: MessageSquare, color: 'text-primary', glow: 'rgba(21,191,65,0.12)' },
          { label: 'Média por dia', value: Math.round(data.perDay * 10) / 10, decimals: 1, sub: 'chats/dia', icon: CalendarDays, color: 'text-blue-500', glow: 'rgba(59,130,246,0.12)' },
          { label: 'Pico de volume', value: data.best?.v || 0, sub: data.best ? fmtShort(data.best.t) : '—', icon: Flame, color: 'text-orange-500', glow: 'rgba(249,115,22,0.12)' },
          { label: 'Tendência', value: Math.abs(Math.round(data.trend)), decimals: 0, suffix: '%', sub: rising ? 'crescendo' : 'caindo', icon: rising ? TrendingUp : TrendingDown, color: rising ? 'text-emerald-500' : 'text-red-500', glow: rising ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', prefix: rising ? '↑ ' : '↓ ' },
        ].map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: i * 0.06, duration: 0.5 }}
            whileHover={{ y: -3 }}
            className="relative rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden"
          >
            <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full blur-2xl" style={{ background: k.glow }} />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-muted-foreground font-medium">{k.label}</span>
                <div className={`h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center ${k.color}`}>
                  <k.icon className="h-3.5 w-3.5" />
                </div>
              </div>
              <p className={`text-2xl font-bold tracking-tight ${k.color}`}>
                {k.prefix || ''}<AnimatedCounter value={k.value} decimals={(k as any).decimals || 0} suffix={(k as any).suffix || ''} />
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{k.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ─────────── Gráfico principal ─────────── */}
      <div className="relative rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="pointer-events-none absolute -top-16 left-1/3 h-40 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Evolução de novos chats
            </h3>
            <p className="text-[11px] text-muted-foreground">{data.weekly ? 'Agregado por semana' : 'Por dia'} · linha tracejada = média móvel</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
            <button onClick={() => setChartType('line')} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${chartType === 'line' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <LineChart className="h-3.5 w-3.5" /> Linha
            </button>
            <button onClick={() => setChartType('area')} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${chartType === 'area' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <AreaChart className="h-3.5 w-3.5" /> Área
            </button>
          </div>
        </div>

        {chart && (
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${chart.W} ${chart.H}`}
              className="w-full"
              style={{ height: 300, cursor: 'crosshair' }}
              onMouseMove={handleMove}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id="evo-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#15BF41" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="#15BF41" stopOpacity="0" />
                </linearGradient>
                <filter id="evo-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* grid Y */}
              {chart.yticks.map((t, i) => (
                <g key={i}>
                  <line x1={chart.padL} y1={t.y} x2={chart.W - chart.padR} y2={t.y} stroke="currentColor" className="text-border" strokeWidth={0.5} opacity={0.5} />
                  <text x={chart.padL - 6} y={t.y + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 9 }}>{t.v}</text>
                </g>
              ))}

              {/* área */}
              {chartType === 'area' && (
                <motion.path d={chart.areaPath} fill="url(#evo-area)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
              )}

              {/* média móvel */}
              <motion.path
                d={chart.maPath} fill="none" stroke="currentColor" className="text-muted-foreground/50"
                strokeWidth={1.5} strokeDasharray="5 4"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, delay: 0.3 }}
              />

              {/* linha principal */}
              <motion.path
                d={chart.linePath} fill="none" stroke="#15BF41" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
                filter="url(#evo-glow)"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: 'easeInOut' }}
              />

              {/* marcador de pico */}
              {data.best && chart.linePts[data.series.indexOf(data.best as any)] && (() => {
                const pi = data.series.findIndex(b => b === data.best);
                const p = chart.linePts[pi];
                if (!p) return null;
                return (
                  <g>
                    <motion.circle cx={p[0]} cy={p[1]} r={5} fill="#f97316" opacity={0.25}
                      animate={{ r: [4, 9, 4], opacity: [0.3, 0, 0.3] }} transition={{ duration: 2, repeat: Infinity }} />
                    <circle cx={p[0]} cy={p[1]} r={3.2} fill="#f97316" stroke="#fff" strokeWidth={1.2} />
                  </g>
                );
              })()}

              {/* crosshair + ponto no hover */}
              {hover && hoverIdx != null && (
                <g>
                  <line x1={chart.x(hoverIdx)} y1={chart.padT} x2={chart.x(hoverIdx)} y2={chart.H - chart.padB} stroke="#15BF41" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
                  <circle cx={chart.x(hoverIdx)} cy={chart.y(hover.v)} r={4.5} fill="#15BF41" stroke="#fff" strokeWidth={2} />
                </g>
              )}

              {/* ticks X */}
              {chart.xticks.map((t, i) => (
                <text key={i} x={chart.x(t.i)} y={chart.H - 8} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>{fmtShort(t.t)}</text>
              ))}
            </svg>

            {/* tooltip premium — segue o ponto, centralizado e com clamp (sem pulo) */}
            {hover && hoverIdx != null && chart && (
              <div
                className="pointer-events-none absolute z-10 rounded-xl border border-border/60 bg-popover/95 backdrop-blur px-3 py-2 shadow-lg whitespace-nowrap"
                style={{
                  left: `${Math.max(8, Math.min(92, (chart.x(hoverIdx) / chart.W) * 100))}%`,
                  top: 8,
                  transform: 'translateX(-50%)',
                }}
              >
                <p className="text-[11px] font-semibold text-foreground">{fmtFull(hover.t)}{data.weekly ? ' (semana)' : ''}</p>
                <p className="text-lg font-bold text-primary leading-tight">{hover.v} <span className="text-[11px] font-normal text-muted-foreground">chats</span></p>
                <p className={`text-[10px] font-medium ${hover.v >= hoverMA ? 'text-emerald-500' : 'text-red-500'}`}>
                  {hover.v >= hoverMA ? '↑' : '↓'} {hoverMA > 0 ? Math.abs(Math.round(((hover.v - hoverMA) / hoverMA) * 100)) : 0}% vs média
                </p>
              </div>
            )}
          </div>
        )}

        {/* insight IA */}
        <div className="relative mt-4 flex items-start gap-2.5 rounded-xl border border-primary/15 bg-primary/[0.04] p-3.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </span>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {rising
              ? <>Tendência de <strong className="text-emerald-600 dark:text-emerald-400">alta de {Math.abs(Math.round(data.trend))}%</strong> no volume de novos chats no período. Pico de <strong className="text-foreground">{data.best?.v}</strong> em {data.best ? fmtShort(data.best.t) : '—'}.</>
              : <>Queda de <strong className="text-red-500">{Math.abs(Math.round(data.trend))}%</strong> no volume recente. Vale revisar o fluxo / campanhas ativas.</>}
          </p>
        </div>
      </div>

      {/* ─────────── Período do dia + Heatmap ─────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Donut por período do dia */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Sun className="h-4 w-4 text-amber-500" /> Distribuição por período do dia
          </h3>
          <div className="flex items-center gap-5 flex-wrap">
            <div className="relative h-[150px] w-[150px] shrink-0 mx-auto">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                {(() => {
                  const R = 46, C = 2 * Math.PI * R;
                  const tot = data.dayparts.reduce((a, b) => a + b.count, 0) || 1;
                  let acc = 0;
                  return data.dayparts.filter(d => d.count > 0).map((d, i) => {
                    const seg = (d.count / tot) * C;
                    const rot = (acc / tot) * 360;
                    acc += d.count;
                    return (
                      <motion.circle key={d.key} cx={60} cy={60} r={R} fill="none" stroke={d.color} strokeWidth={13}
                        strokeDasharray={`${seg} ${C}`} transform={`rotate(${rot} 60 60)`}
                        initial={{ strokeDashoffset: seg }} animate={{ strokeDashoffset: 0 }}
                        transition={{ duration: 0.9, delay: 0.2 + i * 0.1, ease: 'easeOut' }} />
                    );
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold text-foreground leading-none"><AnimatedCounter value={data.total} /></span>
                <span className="text-[10px] text-muted-foreground">chats</span>
              </div>
            </div>
            <div className="flex-1 min-w-[150px] space-y-1.5">
              {data.dayparts.map(d => {
                const tot = data.dayparts.reduce((a, b) => a + b.count, 0) || 1;
                return (
                  <div key={d.key} className="flex items-center gap-2.5">
                    <span className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${d.color}1f` }}>
                      <d.icon className="h-3.5 w-3.5" style={{ color: d.color }} />
                    </span>
                    <span className="text-xs text-foreground flex-1">{d.key}</span>
                    <span className="text-xs font-semibold text-foreground tabular-nums">{d.count}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{((d.count / tot) * 100).toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
          {(() => {
            const top = [...data.dayparts].sort((a, b) => b.count - a.count)[0];
            const tot = data.dayparts.reduce((a, b) => a + b.count, 0) || 1;
            return top && top.count > 0 ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-border/50 bg-muted/20 p-3">
                <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  O período da <strong className="text-foreground">{top.key.toLowerCase()}</strong> concentra <strong className="text-foreground">{((top.count / tot) * 100).toFixed(0)}%</strong> dos novos chats — melhor janela para reforçar atendimento.
                </p>
              </div>
            ) : null;
          })()}
        </div>

        {/* Heatmap por hora */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Intensidade por horário
          </h3>
          {(() => {
            const maxH = Math.max(...data.hourly.map(h => h.v), 1);
            const peak = [...data.hourly].sort((a, b) => b.v - a.v)[0];
            return (
              <>
                <div className="grid grid-cols-12 gap-1.5">
                  {data.hourly.map((h, i) => {
                    const intensity = h.v / maxH;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.012 }}
                        className="group relative aspect-square rounded-md flex items-center justify-center"
                        style={{ background: intensity > 0 ? `rgba(21,191,65,${0.12 + intensity * 0.78})` : 'hsl(var(--muted))' }}
                        title={`${String(h.h).padStart(2, '0')}h · ${h.v} chats`}
                      >
                        <span className={`text-[8px] font-medium ${intensity > 0.5 ? 'text-white' : 'text-muted-foreground'}`}>{h.h}</span>
                      </motion.div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
                </div>
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-border/50 bg-muted/20 p-3">
                  <Flame className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Pico operacional às <strong className="text-foreground">{String(peak.h).padStart(2, '0')}h</strong> ({peak.v} chats). Concentre operadores nesse horário.
                  </p>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* ─────────── Comparativo + Top 5 ─────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Comparativo período anterior */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Comparativo com período anterior
          </h3>
          <div className="flex items-end gap-6 mb-4">
            <div>
              <p className="text-[11px] text-muted-foreground">Período atual</p>
              <p className="text-3xl font-bold text-foreground leading-none"><AnimatedCounter value={data.cur} /></p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Anterior</p>
              <p className="text-2xl font-bold text-muted-foreground/70 leading-none"><AnimatedCounter value={data.prev} /></p>
            </div>
            <div className={`ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold ${grY ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400'}`}>
              {grY ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {Math.abs(Math.round(data.growth))}%
            </div>
          </div>
          {/* barras comparativas */}
          {(() => {
            const mx = Math.max(data.cur, data.prev, 1);
            return (
              <div className="space-y-2.5">
                <div>
                  <div className="flex justify-between text-[11px] mb-1"><span className="text-muted-foreground">Atual</span><span className="font-semibold text-foreground">{data.cur}</span></div>
                  <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary" initial={{ width: 0 }} animate={{ width: `${(data.cur / mx) * 100}%` }} transition={{ duration: 1, ease: 'easeOut' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-1"><span className="text-muted-foreground">Anterior</span><span className="font-semibold text-muted-foreground">{data.prev}</span></div>
                  <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                    <motion.div className="h-full rounded-full bg-muted-foreground/40" initial={{ width: 0 }} animate={{ width: `${(data.prev / mx) * 100}%` }} transition={{ duration: 1, delay: 0.15, ease: 'easeOut' }} />
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-border/50 bg-muted/20 p-3">
            <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {grY
                ? <>O volume {data.growth >= 0 ? 'aumentou' : ''} <strong className="text-emerald-600 dark:text-emerald-400">{Math.abs(Math.round(data.growth))}%</strong> vs o período anterior. Projeção do próximo ciclo: <strong className="text-foreground">~{data.prediction}</strong> chats.</>
                : <>Queda de <strong className="text-red-500">{Math.abs(Math.round(data.growth))}%</strong> vs período anterior. Projeção: <strong className="text-foreground">~{data.prediction}</strong> chats no próximo ciclo.</>}
            </p>
          </div>
        </div>

        {/* Top 5 dias */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" /> Top {data.top.length} {data.weekly ? 'semanas' : 'dias'} de maior volume
          </h3>
          <div className="space-y-2.5">
            {data.top.map((d, i) => {
              const mx = data.top[0]?.v || 1;
              const medal = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-800', 'bg-orange-400 text-orange-950', 'bg-muted text-muted-foreground', 'bg-muted text-muted-foreground'][i];
              return (
                <motion.div
                  key={d.t}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                  className="group flex items-center gap-3 rounded-xl border border-border/50 bg-muted/10 p-2.5 hover:bg-muted/30 transition-colors"
                >
                  <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${medal}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground">{fmtFull(d.t)}</span>
                      <span className="text-sm font-bold text-foreground tabular-nums">{d.v}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <motion.div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary" initial={{ width: 0 }} animate={{ width: `${(d.v / mx) * 100}%` }} transition={{ duration: 0.8, delay: 0.1 + i * 0.08 }} />
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{((d.v / data.total) * 100).toFixed(1)}%</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatEvolutionPage;
