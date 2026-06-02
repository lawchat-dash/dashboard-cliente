import { useMemo } from 'react';
import AnimatedCounter from '@/components/AnimatedCounter';
import { motion } from 'framer-motion';
import { Card } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { Clock, Info, TrendingDown, TrendingUp, Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AverageTimeCardsProps {
  cards: Card[];
}

function hoursBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3600000);
}

// buckets de distribuição (contínuos, cobrindo todo o range)
const BUCKETS = [
  { key: 'Até 24h', max: 24, color: '#15803d' },
  { key: '1 a 2 dias', max: 48, color: '#16a34a' },
  { key: '3 a 5 dias', max: 120, color: '#22c55e' },
  { key: '6 a 10 dias', max: 240, color: '#4ade80' },
  { key: 'Acima de 10 dias', max: Infinity, color: '#bbf7d0' },
];

function bucketIndex(hours: number): number {
  for (let i = 0; i < BUCKETS.length; i++) if (hours <= BUCKETS[i].max) return i;
  return BUCKETS.length - 1;
}

const AverageTimeCards = ({ cards }: AverageTimeCardsProps) => {
  const { classify } = useClassify();

  const data = useMemo(() => {
    const now = Date.now();
    const DAY = 86400000;
    const nonArchived = cards.filter(c => !c.archived);
    const closed = nonArchived
      .filter(c => classify(c) === 'CONTRATO FECHADO')
      .map(c => ({ h: hoursBetween(c.createdAt, c.updatedAt), at: new Date(c.updatedAt).getTime() }))
      .filter(c => c.h >= 0 && !isNaN(c.at));

    const n = closed.length;
    const avgHours = n ? closed.reduce((s, c) => s + c.h, 0) / n : 0;
    const avgDays = avgHours / 24;

    // delta vs período anterior (30d atual x 30-60d)
    const cur = closed.filter(c => c.at >= now - 30 * DAY);
    const prev = closed.filter(c => c.at < now - 30 * DAY && c.at >= now - 60 * DAY);
    const avgCur = cur.length ? cur.reduce((s, c) => s + c.h, 0) / cur.length : 0;
    const avgPrev = prev.length ? prev.reduce((s, c) => s + c.h, 0) / prev.length : 0;
    const delta = avgPrev > 0 ? ((avgCur - avgPrev) / avgPrev) * 100 : 0;

    // distribuição
    const dist = BUCKETS.map(b => ({ ...b, count: 0 }));
    closed.forEach(c => { dist[bucketIndex(c.h)].count++; });
    const distTotal = n;

    // série semanal de tempo médio (últimas 8 semanas)
    const WEEKS = 8;
    const wk = 7 * DAY;
    const sums = new Array(WEEKS).fill(0);
    const cnts = new Array(WEEKS).fill(0);
    closed.forEach(c => {
      const idx = WEEKS - 1 - Math.floor((now - c.at) / wk);
      if (idx >= 0 && idx < WEEKS) { sums[idx] += c.h / 24; cnts[idx]++; }
    });
    const weekly = sums.map((s, i) => (cnts[i] ? s / cnts[i] : 0));

    // "mais rápido que X%": share de contratos que demoraram mais que a média
    const slower = n ? closed.filter(c => c.h > avgHours).length / n * 100 : 0;

    return { avgHours, avgDays, n, delta, dist, distTotal, weekly, fasterThan: Math.round(slower) };
  }, [cards, classify]);

  const faster = data.delta <= 0;

  // área (gráfico de tempo médio semanal)
  const area = useMemo(() => {
    const vals = data.weekly;
    const w = 240, h = 96;
    const max = Math.max(...vals, 1);
    const step = vals.length > 1 ? w / (vals.length - 1) : w;
    const pts = vals.map((v, i) => [i * step, h - (v / max) * (h - 12) - 6]);
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const fill = `${line} L${w},${h} L0,${h} Z`;
    return { line, fill, pts, w, h };
  }, [data.weekly]);

  // donut
  const donut = useMemo(() => {
    const total = data.distTotal || 1;
    const R = 46, C = 2 * Math.PI * R;
    let acc = 0;
    const segs = data.dist.filter(d => d.count > 0).map(d => {
      const seg = (d.count / total) * C;
      const rot = (acc / total) * 360;
      acc += d.count;
      return { ...d, seg, rot, pct: (d.count / total) * 100 };
    });
    return { segs, C, R };
  }, [data.dist, data.distTotal]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl border border-border/60 bg-card p-5 md:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)] h-full flex flex-col overflow-hidden"
    >
      {/* glow */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15">
            <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Tempo Médio até Fechamento</h3>
          <Tooltip>
            <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/60 cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-[250px] text-xs">
              Média de tempo entre a criação do lead e o fechamento do contrato.
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="ml-10 -mt-0.5 mb-4 text-[11px] text-muted-foreground">Quanto tempo leva da entrada até o contrato</p>
      </div>

      {/* número + área */}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="flex items-end gap-1.5">
            <span className="text-5xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 leading-none">
              <AnimatedCounter value={data.avgDays} decimals={1} duration={1100} />
            </span>
            <span className="text-base text-muted-foreground mb-1">dias</span>
          </div>
          <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${faster ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {faster ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
            {faster ? '↓' : '↑'} {Math.abs(data.delta).toFixed(0)}% vs período anterior
          </p>
        </div>
        <svg viewBox={`0 0 ${area.w} ${area.h}`} className="h-24 w-44 shrink-0" preserveAspectRatio="none">
          <defs>
            <linearGradient id="avgtime-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area.fill} fill="url(#avgtime-area)" />
          <motion.path
            d={area.line} fill="none" stroke="#22c55e" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }}
          />
          {area.pts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={1.8} fill="#16a34a" />
          ))}
        </svg>
      </div>

      {/* badge horas + base */}
      <div className="relative mt-3 flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-sm font-semibold text-foreground">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          {data.avgHours.toFixed(1)} horas
        </span>
        <span className="text-[11px] text-muted-foreground">Baseado em {data.n} contrato{data.n !== 1 ? 's' : ''} fechado{data.n !== 1 ? 's' : ''}</span>
      </div>

      {/* distribuição (donut + legenda) */}
      <div className="relative mt-5 rounded-xl border border-border/50 bg-muted/20 p-4 flex-1 flex flex-col">
        <p className="mb-3 text-xs font-semibold text-foreground flex items-center gap-1.5">
          Distribuição do tempo até fechamento
          <Tooltip>
            <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/60 cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-[220px] text-xs">Quantos contratos fecharam em cada faixa de tempo.</TooltipContent>
          </Tooltip>
        </p>
        {data.n === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Sem contratos fechados no período.</p>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-6 flex-wrap">
            <div className="relative h-[150px] w-[150px] shrink-0 mx-auto">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                {donut.segs.map((s, i) => (
                  <motion.circle
                    key={s.key}
                    cx={60} cy={60} r={donut.R} fill="none" stroke={s.color} strokeWidth={12}
                    strokeDasharray={`${s.seg} ${donut.C}`} transform={`rotate(${s.rot} 60 60)`}
                    initial={{ strokeDashoffset: s.seg }} animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 0.9, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold text-foreground leading-none"><AnimatedCounter value={data.n} /></span>
                <span className="text-[10px] text-muted-foreground">contratos</span>
              </div>
            </div>
            <div className="flex-1 min-w-[160px] space-y-1">
              {data.dist.map(d => (
                <div key={d.key} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="text-xs text-foreground flex-1">{d.key}</span>
                  <span className="text-xs font-semibold text-foreground tabular-nums w-12 text-right">
                    {data.distTotal ? ((d.count / data.distTotal) * 100).toFixed(1) : '0.0'}%
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* insight */}
      <div className="relative mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200/50 bg-emerald-50/40 dark:border-emerald-500/15 dark:bg-emerald-500/[0.06] p-3.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        </span>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {data.n > 0
            ? <>Você fecha mais rápido que <strong className="text-foreground">{data.fasterThan}%</strong> dos contratos. {faster ? 'Continue assim!' : 'Dá pra acelerar o fluxo.'}</>
            : 'Assim que houver contratos fechados, mostramos a análise de tempo aqui.'}
        </p>
      </div>
    </motion.div>
  );
};

export default AverageTimeCards;
