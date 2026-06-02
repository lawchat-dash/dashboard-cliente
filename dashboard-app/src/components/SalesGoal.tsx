import { useMemo, useState, useEffect, useRef } from 'react';
import AnimatedCounter from '@/components/AnimatedCounter';
import { Card as CardType } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { motion } from 'framer-motion';
import { Target, Pencil, Check, Info, TrendingUp, CalendarDays, Clock, Sparkles, Flag } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SalesGoalProps {
  cards: CardType[];
}

function getMonthKey() {
  const now = new Date();
  return `sales-goal-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function getPrevMonthKey() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `sales-goal-${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}
function loadGoal(): number {
  const stored = localStorage.getItem(getMonthKey());
  if (stored) return parseInt(stored, 10);
  const prev = localStorage.getItem(getPrevMonthKey());
  return prev ? parseInt(prev, 10) : 20;
}

const SalesGoal = ({ cards }: SalesGoalProps) => {
  const { classify } = useClassify();
  const [goal, setGoal] = useState(loadGoal);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goal));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const handleSave = () => {
    const val = Math.max(1, parseInt(draft, 10) || 1);
    setGoal(val);
    localStorage.setItem(getMonthKey(), String(val));
    setEditing(false);
  };

  const m = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const monthStart = new Date(year, month, 1).getTime();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const daysRemaining = Math.max(0, daysInMonth - dayOfMonth);

    // fechados no mês, por dia
    const byDay = new Array(daysInMonth + 1).fill(0);
    let closed = 0;
    cards.forEach(c => {
      if (classify(c) !== 'CONTRATO FECHADO') return;
      const u = new Date(c.updatedAt);
      if (u.getTime() < monthStart) return;
      if (u.getFullYear() !== year || u.getMonth() !== month) return;
      const d = u.getDate();
      if (d >= 1 && d <= daysInMonth) { byDay[d]++; closed++; }
    });

    const pct = goal > 0 ? (closed / goal) * 100 : 0;
    const faltam = Math.max(0, goal - closed);

    // Projeção: ritmo diário extrapolado, mas SUAVIZADO no começo do mês.
    // Poucos dias = ruído altíssimo (ex.: 13 em 2 dias → 195/mês = 975% da meta).
    // Misturamos o run-rate com a própria meta conforme a "confiança" cresce nos
    // primeiros ~7 dias, e limitamos a 2× a meta para nunca exibir números absurdos.
    const rawRate = dayOfMonth > 0 ? (closed / dayOfMonth) * daysInMonth : closed;
    const confidence = Math.min(1, dayOfMonth / 7);
    const blended = rawRate * confidence + goal * (1 - confidence);
    const projecao = Math.round(Math.max(closed, Math.min(blended, goal * 2)));
    const projecaoPct = goal > 0 ? Math.round((projecao / goal) * 100) : 0;
    const mediaDiaria = daysRemaining > 0 ? faltam / daysRemaining : faltam;

    // melhor dia
    let bestDay = 0, bestCount = 0;
    for (let d = 1; d <= daysInMonth; d++) if (byDay[d] > bestCount) { bestCount = byDay[d]; bestDay = d; }

    // cumulativo (realizado) até hoje
    const cum: number[] = [];
    let run = 0;
    for (let d = 1; d <= dayOfMonth; d++) { run += byDay[d]; cum.push(run); }

    return {
      year, month, daysInMonth, dayOfMonth, daysRemaining, closed, pct,
      faltam, projecao, projecaoPct, mediaDiaria, bestDay, bestCount, cum,
    };
  }, [cards, goal, classify]);

  const reached = m.pct >= 100;
  const color = m.pct >= 80 ? '#16a34a' : m.pct >= 50 ? '#f59e0b' : '#ef4444';

  // gráfico de evolução
  const chart = useMemo(() => {
    const W = 470, H = 170, padL = 26, padR = 10, padT = 10, padB = 22;
    const di = m.daysInMonth;
    const yMax = Math.max(goal, m.projecao, m.cum[m.cum.length - 1] || 0, 1) * 1.1;
    const x = (day: number) => padL + ((day - 1) / Math.max(1, di - 1)) * (W - padL - padR);
    const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);

    // realizado
    const realizado = m.cum.map((v, i) => [x(i + 1), y(v)]);
    const realizadoPath = realizado.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

    // projeção (do ponto de hoje até fim do mês)
    const lastX = x(m.dayOfMonth), lastY = y(m.cum[m.cum.length - 1] || 0);
    const projPath = `M${lastX.toFixed(1)},${lastY.toFixed(1)} L${x(di).toFixed(1)},${y(m.projecao).toFixed(1)}`;

    // meta (linear 0 → goal)
    const metaPath = `M${x(1).toFixed(1)},${y(goal / di).toFixed(1)} L${x(di).toFixed(1)},${y(goal).toFixed(1)}`;

    // ticks Y
    const yticks = [0, Math.round(yMax / 2), Math.round(yMax)].map(v => ({ v, y: y(v) }));
    // ticks X (a cada ~5 dias)
    const xticks: { d: number; x: number }[] = [];
    for (let d = 1; d <= di; d += Math.max(1, Math.round(di / 6))) xticks.push({ d, x: x(d) });
    if (xticks[xticks.length - 1]?.d !== di) xticks.push({ d: di, x: x(di) });

    return { W, H, realizadoPath, realizado, projPath, metaPath, yticks, xticks, x, y, di };
  }, [m, goal]);

  const fmtDay = (d: number) => `${String(d).padStart(2, '0')}/${String(m.month + 1).padStart(2, '0')}`;

  const metrics = [
    { label: 'Faltam', value: m.faltam, unit: 'contratos', sub: 'para bater a meta', icon: Flag, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/15' },
    { label: 'Projeção para o mês', value: m.projecao, unit: 'contratos', sub: `${m.projecaoPct}% da meta`, icon: CalendarDays, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/15' },
    { label: 'Média diária necessária', value: m.mediaDiaria, unit: 'contratos/dia', sub: 'para bater a meta', icon: Clock, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-500/15', decimals: 2 },
    { label: 'Melhor dia do mês', value: m.bestCount, unit: 'contratos', sub: m.bestDay ? `em ${fmtDay(m.bestDay)}` : '—', icon: Sparkles, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-500/15' },
  ];

  // posição do marcador na barra (clamp 0..100)
  const markerPct = Math.min(100, Math.max(0, m.pct));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl border border-border/60 bg-card p-5 md:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)] h-full flex flex-col overflow-hidden"
    >
      <div className="pointer-events-none absolute -top-10 -left-10 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* header */}
      <div className="relative flex items-start gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15">
          <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Meta de Vendas</h3>
            <Tooltip>
              <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/60 cursor-help" /></TooltipTrigger>
              <TooltipContent className="max-w-[230px] text-xs">Contratos fechados no mês ÷ meta. Clique no lápis para editar a meta.</TooltipContent>
            </Tooltip>
          </div>
          <p className="text-[11px] text-muted-foreground">Acompanhe o progresso mensal de contratos fechados</p>
        </div>
        <button
          onClick={() => { setDraft(String(goal)); setEditing(!editing); }}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title="Editar meta"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* número + meta */}
      <div className="relative mt-4 flex items-end justify-between gap-3">
        <div>
          <span className="text-4xl font-bold tracking-tight text-foreground leading-none">
            <AnimatedCounter value={m.closed} duration={900} />
          </span>
          <p className="mt-1 text-xs text-muted-foreground">contratos fechados</p>
        </div>
        <div className="text-right">
          {editing ? (
            <div className="flex items-center gap-1 justify-end">
              <span className="text-sm text-muted-foreground">de</span>
              <input
                ref={inputRef} type="number" min={1} value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                className="w-14 rounded border border-input bg-background px-1.5 py-0.5 text-sm text-foreground text-center"
              />
              <button onClick={handleSave} className="rounded p-0.5 text-emerald-600 hover:bg-secondary transition-colors">
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">de {goal} contratos</p>
          )}
          <span className="mt-1 inline-block rounded-full bg-emerald-100 dark:bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            {m.pct.toFixed(0)}% da meta
          </span>
        </div>
      </div>

      {/* barra com marcador + escala */}
      <div className="relative mt-5">
        <div className="relative h-2.5 w-full rounded-full bg-secondary overflow-visible">
          <motion.div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }} animate={{ width: `${markerPct}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
          {/* marcador */}
          <motion.div
            className="absolute -top-7 -translate-x-1/2"
            initial={{ left: '0%', opacity: 0 }} animate={{ left: `${markerPct}%`, opacity: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          >
            <span className="block rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white shadow" style={{ backgroundColor: color }}>
              {m.closed}
            </span>
            <span className="block mx-auto h-2 w-0.5" style={{ backgroundColor: color }} />
          </motion.div>
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground tabular-nums">
          {[0, Math.round(goal / 4), Math.round(goal / 2), Math.round((goal * 3) / 4), goal].map((v, i) => (
            <span key={i}>{v}</span>
          ))}
        </div>
      </div>

      {/* 4 cards de métrica */}
      <div className="relative mt-5 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {metrics.map((mt, i) => (
          <motion.div
            key={mt.label}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07 }}
            className="rounded-xl border border-border/50 bg-muted/20 p-3"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`flex h-6 w-6 items-center justify-center rounded-md ${mt.bg}`}>
                <mt.icon className={`h-3 w-3 ${mt.color}`} />
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">{mt.label}</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-foreground leading-none">
              <AnimatedCounter value={mt.value} decimals={mt.decimals || 0} duration={900} />
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">{mt.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* evolução da meta */}
      <div className="relative mt-5 rounded-xl border border-border/50 bg-muted/20 p-4 flex-1">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-foreground">Evolução da meta</p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Realizado</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-emerald-500" style={{ borderTop: '1px dashed' }} />Projeção</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-muted-foreground/50" />Meta</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full" style={{ height: 170 }}>
          {/* grid Y */}
          {chart.yticks.map((t, i) => (
            <g key={i}>
              <line x1={26} y1={t.y} x2={chart.W - 10} y2={t.y} stroke="currentColor" className="text-border" strokeWidth={0.5} opacity={0.5} />
              <text x={20} y={t.y + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 8 }}>{t.v}</text>
            </g>
          ))}
          {/* meta */}
          <path d={chart.metaPath} fill="none" stroke="currentColor" className="text-muted-foreground/50" strokeWidth={1.5} strokeDasharray="4 4" />
          {/* projeção */}
          <motion.path
            d={chart.projPath} fill="none" stroke="#16a34a" strokeWidth={1.8} strokeDasharray="4 4"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, delay: 1 }}
          />
          {/* realizado */}
          <motion.path
            d={chart.realizadoPath} fill="none" stroke="#16a34a" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.3, ease: 'easeOut' }}
          />
          {chart.realizado.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={1.8} fill="#16a34a" />
          ))}
          {/* ticks X */}
          {chart.xticks.map((t, i) => (
            <text key={i} x={t.x} y={chart.H - 6} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 8 }}>{fmtDay(t.d)}</text>
          ))}
        </svg>
      </div>

      {/* insight */}
      <div className="relative mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200/50 bg-emerald-50/40 dark:border-emerald-500/15 dark:bg-emerald-500/[0.06] p-3.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        </span>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {reached
            ? <><strong className="text-foreground">Meta batida!</strong> Você fechou {m.closed} de {goal} contratos este mês. 🎉</>
            : <>No ritmo atual, você deve alcançar <strong className="text-foreground">{m.projecaoPct}%</strong> da meta mensal. {m.projecaoPct >= 100 ? 'Vai superar!' : 'Mantenha o foco para superar!'}</>}
        </p>
      </div>
    </motion.div>
  );
};

export default SalesGoal;
