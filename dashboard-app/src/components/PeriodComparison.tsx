import { useState, useMemo } from 'react';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { motion } from 'framer-motion';
import AnimatedCounter from '@/components/AnimatedCounter';
import {
  GitCompareArrows, ArrowUpRight, ArrowDownRight, Users, FileCheck, Percent, Timer, MessageSquare, Sparkles,
} from 'lucide-react';

interface PeriodComparisonProps {
  cards: Card[];
  sessions: Session[];
}

const DAY = 86400000;
function toInput(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromInput(s: string) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
function fmt(t: number) { return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function hoursBetween(a: string, b: string) { return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3600000); }

interface Range { start: number; end: number; }

const PeriodComparison = ({ cards }: PeriodComparisonProps) => {
  const { classify } = useClassify();

  const todayEnd = useMemo(() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); }, []);
  const [a, setA] = useState<Range>({ start: todayEnd - 29 * DAY, end: todayEnd });
  const [b, setB] = useState<Range>({ start: todayEnd - 59 * DAY, end: todayEnd - 30 * DAY });
  const [preset, setPreset] = useState<string>('30d');

  const applyPreset = (key: string) => {
    setPreset(key);
    const now = new Date(); now.setHours(23, 59, 59, 999); const end = now.getTime();
    if (key === '7d') { setA({ start: end - 6 * DAY, end }); setB({ start: end - 13 * DAY, end: end - 7 * DAY }); }
    else if (key === '30d') { setA({ start: end - 29 * DAY, end }); setB({ start: end - 59 * DAY, end: end - 30 * DAY }); }
    else if (key === '90d') { setA({ start: end - 89 * DAY, end }); setB({ start: end - 179 * DAY, end: end - 90 * DAY }); }
    else if (key === 'mes') {
      const d = new Date();
      const curStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
      const prevEnd = curStart - 1;
      setA({ start: curStart, end }); setB({ start: prevStart, end: prevEnd });
    }
  };

  const compute = useMemo(() => (r: Range) => {
    const valid = cards.filter(c => !c.archived);
    const leads = valid.filter(c => { const t = new Date(c.createdAt).getTime(); return t >= r.start && t <= r.end; });
    const closed = valid.filter(c => {
      if (classify(c) !== 'CONTRATO FECHADO') return false;
      const cAny = c as any;
      const t = new Date(cAny.contractNote?.createdAt || c.updatedAt).getTime();
      return t >= r.start && t <= r.end;
    });
    const conv = leads.length > 0 ? (closed.length / leads.length) * 100 : 0;
    const withT = closed.map(c => { const cAny = c as any; return hoursBetween(c.createdAt, cAny.contractNote?.createdAt || c.updatedAt); }).filter(h => h > 0);
    const avgDays = withT.length ? (withT.reduce((s, h) => s + h, 0) / withT.length) / 24 : 0;
    const numDays = Math.max(1, Math.round((r.end - r.start) / DAY) + 1);
    const perDay = leads.length / numDays;
    // série diária normalizada (0..numDays-1)
    const series = new Array(numDays).fill(0);
    leads.forEach(c => {
      const idx = Math.floor((new Date(c.createdAt).getTime() - r.start) / DAY);
      if (idx >= 0 && idx < numDays) series[idx]++;
    });
    return { leads: leads.length, closed: closed.length, conv, avgDays, perDay, numDays, series };
  }, [cards, classify]);

  const mA = useMemo(() => compute(a), [compute, a]);
  const mB = useMemo(() => compute(b), [compute, b]);

  const delta = (x: number, y: number) => (y > 0 ? ((x - y) / y) * 100 : (x > 0 ? 100 : 0));

  const metrics = [
    { key: 'leads', label: 'Novos leads', icon: Users, a: mA.leads, b: mB.leads, decimals: 0, better: 'up' },
    { key: 'closed', label: 'Contratos fechados', icon: FileCheck, a: mA.closed, b: mB.closed, decimals: 0, better: 'up' },
    { key: 'conv', label: 'Conversão', icon: Percent, a: mA.conv, b: mB.conv, decimals: 1, suffix: '%', better: 'up' },
    { key: 'avg', label: 'Tempo médio', icon: Timer, a: mA.avgDays, b: mB.avgDays, decimals: 1, suffix: 'd', better: 'down' },
    { key: 'perday', label: 'Leads por dia', icon: MessageSquare, a: mA.perDay, b: mB.perDay, decimals: 1, better: 'up' },
  ];

  // chart dual (A verde, B cinza) sobre índice de dia normalizado
  const chart = useMemo(() => {
    const W = 1000, H = 220, padL = 30, padR = 14, padT = 14, padB = 24;
    const maxV = Math.max(...mA.series, ...mB.series, 1);
    const path = (series: number[]) => {
      if (series.length === 0) return '';
      return series.map((v, i) => {
        const x = padL + (series.length <= 1 ? 0 : (i / (series.length - 1)) * (W - padL - padR));
        const y = padT + (1 - v / maxV) * (H - padT - padB);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
    };
    return { W, H, padL, padR, padT, padB, maxV, pathA: path(mA.series), pathB: path(mB.series) };
  }, [mA.series, mB.series]);

  const DateRangeEditor = ({ r, set, label, accent }: { r: Range; set: (x: Range) => void; label: string; accent: string }) => (
    <div className="flex-1 min-w-[240px] rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{fmt(r.start)} → {fmt(r.end)}</span>
      </div>
      <div className="flex items-center gap-2">
        <input type="date" value={toInput(r.start)} onChange={e => { setPreset('custom'); set({ ...r, start: fromInput(e.target.value) }); }}
          className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
        <span className="text-muted-foreground text-xs">até</span>
        <input type="date" value={toInput(r.end)} onChange={e => { setPreset('custom'); set({ ...r, end: fromInput(e.target.value) }); }}
          className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center">
            <GitCompareArrows className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Comparador de Períodos</h1>
            <p className="text-sm text-muted-foreground">Compare dois períodos lado a lado</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
          {[{ k: '7d', l: '7 dias' }, { k: '30d', l: '30 dias' }, { k: '90d', l: '90 dias' }, { k: 'mes', l: 'Mês x mês' }].map(p => (
            <button key={p.k} onClick={() => applyPreset(p.k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${preset === p.k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {p.l}
            </button>
          ))}
        </div>
      </div>

      {/* Seletores de data */}
      <div className="flex gap-3 flex-wrap">
        <DateRangeEditor r={a} set={setA} label="Período A (atual)" accent="#15BF41" />
        <DateRangeEditor r={b} set={setB} label="Período B (comparação)" accent="#94a3b8" />
      </div>

      {/* Cards de métrica comparados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {metrics.map((m, i) => {
          const d = delta(m.a, m.b);
          const positive = m.better === 'up' ? d >= 0 : d <= 0;
          const mx = Math.max(m.a, m.b, 0.001);
          return (
            <motion.div
              key={m.key}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-muted-foreground font-medium">{m.label}</span>
                <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold tracking-tight text-foreground">
                  <AnimatedCounter value={m.a} decimals={m.decimals} suffix={(m as any).suffix || ''} />
                </span>
                <span className={`mb-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {d >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(Math.round(d))}%
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">vs {m.b.toLocaleString('pt-BR', { maximumFractionDigits: m.decimals })}{(m as any).suffix || ''} (B)</p>
              {/* mini barras A vs B */}
              <div className="mt-2 space-y-1">
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(m.a / mx) * 100}%` }} transition={{ duration: 0.8 }} />
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <motion.div className="h-full rounded-full bg-muted-foreground/40" initial={{ width: 0 }} animate={{ width: `${(m.b / mx) * 100}%` }} transition={{ duration: 0.8, delay: 0.1 }} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Gráfico comparativo */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Volume de leads por dia</h3>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-primary" /> Período A</span>
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-muted-foreground/50" /> Período B</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full" style={{ height: 220 }}>
          {[0, Math.round(chart.maxV / 2), Math.round(chart.maxV)].map((v, i) => {
            const y = chart.padT + (1 - v / chart.maxV) * (chart.H - chart.padT - chart.padB);
            return (
              <g key={i}>
                <line x1={chart.padL} y1={y} x2={chart.W - chart.padR} y2={y} stroke="currentColor" className="text-border" strokeWidth={0.5} opacity={0.5} />
                <text x={chart.padL - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 9 }}>{v}</text>
              </g>
            );
          })}
          <motion.path d={chart.pathB} fill="none" stroke="currentColor" className="text-muted-foreground/50" strokeWidth={2} strokeDasharray="5 4"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
          <motion.path d={chart.pathA} fill="none" stroke="#15BF41" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4 }} />
        </svg>
      </div>

      {/* Insight */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </span>
        <p className="text-sm text-muted-foreground leading-relaxed">
          No período A você teve <strong className="text-foreground">{mA.leads}</strong> leads e <strong className="text-foreground">{mA.closed}</strong> contratos
          {' '}({mA.conv.toFixed(1)}% de conversão), contra <strong className="text-foreground">{mB.leads}</strong> leads e <strong className="text-foreground">{mB.closed}</strong> contratos no período B.
          {' '}{(() => {
            const dl = delta(mA.leads, mB.leads);
            return dl >= 0
              ? <>Volume de leads <strong className="text-emerald-600 dark:text-emerald-400">subiu {Math.abs(Math.round(dl))}%</strong>.</>
              : <>Volume de leads <strong className="text-red-500">caiu {Math.abs(Math.round(dl))}%</strong> — vale revisar campanhas.</>;
          })()}
        </p>
      </div>
    </div>
  );
};

export default PeriodComparison;
