import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/api/helena';
import { CalendarPlus, CalendarDays, CalendarRange, Info, TrendingUp, TrendingDown, BarChart3, MessageSquare } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AnimatedCounter from '@/components/AnimatedCounter';

interface VolumePanelProps {
  cards: Card[];
}

// Gera path SVG suave a partir de uma série de valores (viewBox 0 0 300 80)
function sparkPath(series: number[]): string {
  if (series.length < 2) return 'M0,70 L300,70';
  const max = Math.max(1, ...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const stepX = 300 / (series.length - 1);
  const pts = series.map((v, i) => {
    const x = i * stepX;
    const y = 72 - ((v - min) / range) * 60; // 72 (base) → 12 (topo)
    return [x, y];
  });
  // Curva suave (catmull-rom simplificado)
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

const VolumePanel = ({ cards }: VolumePanelProps) => {
  const data = useMemo(() => {
    const now = new Date();
    const valid = cards.filter(c => c.createdAt).map(c => new Date(c.createdAt));
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today0 = startOfDay(now);
    const yesterday0 = new Date(today0.getTime() - 86400000);
    const weekAgo = new Date(today0.getTime() - 7 * 86400000);
    const twoWeeksAgo = new Date(today0.getTime() - 14 * 86400000);
    const monthAgo = new Date(today0.getTime() - 30 * 86400000);
    const twoMonthsAgo = new Date(today0.getTime() - 60 * 86400000);

    const between = (a: Date, b: Date) => valid.filter(d => d >= a && d < b).length;
    const since = (a: Date) => valid.filter(d => d >= a).length;

    const today = since(today0);
    const yesterday = between(yesterday0, today0);
    const week = since(weekAgo);
    const lastWeek = between(twoWeeksAgo, weekAgo);
    const month = since(monthAgo);
    const lastMonth = between(twoMonthsAgo, monthAgo);

    const trend = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0);

    // Mini-séries reais
    const todayByHour = Array.from({ length: 12 }, (_, i) => {
      const h0 = new Date(today0.getTime() + (i * 2) * 3600000);
      const h1 = new Date(h0.getTime() + 2 * 3600000);
      return between(h0, h1);
    });
    const weekByDay = Array.from({ length: 7 }, (_, i) => {
      const d0 = new Date(weekAgo.getTime() + i * 86400000);
      const d1 = new Date(d0.getTime() + 86400000);
      return between(d0, d1);
    });
    const monthByDay = Array.from({ length: 15 }, (_, i) => {
      const d0 = new Date(monthAgo.getTime() + (i * 2) * 86400000);
      const d1 = new Date(d0.getTime() + 2 * 86400000);
      return between(d0, d1);
    });

    return {
      today, yesterday, week, lastWeek, month, lastMonth,
      todayTrend: trend(today, yesterday),
      weekTrend: trend(week, lastWeek),
      monthTrend: trend(month, lastMonth),
      total: month,
      totalTrend: trend(month, lastMonth),
      todayByHour, weekByDay, monthByDay,
    };
  }, [cards]);

  const items = [
    { label: 'Criados Hoje', value: data.today, trend: data.todayTrend, sub: 'vs ontem', icon: CalendarPlus, stroke: '#f59e0b', fill: '#fbbf24', tint: 'from-amber-50/70', iconBg: 'bg-amber-100 dark:bg-amber-500/15', iconColor: 'text-amber-600 dark:text-amber-300', series: data.todayByHour },
    { label: 'Esta Semana', value: data.week, trend: data.weekTrend, sub: 'vs semana passada', icon: CalendarDays, stroke: '#06b6d4', fill: '#22d3ee', tint: 'from-cyan-50/70', iconBg: 'bg-cyan-100 dark:bg-cyan-500/15', iconColor: 'text-cyan-600 dark:text-cyan-300', series: data.weekByDay },
    { label: 'Este Mês', value: data.month, trend: data.monthTrend, sub: 'vs mês passado', icon: CalendarRange, stroke: '#ec4899', fill: '#f472b6', tint: 'from-pink-50/70', iconBg: 'bg-pink-100 dark:bg-pink-500/15', iconColor: 'text-pink-600 dark:text-pink-300', series: data.monthByDay },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
      className="relative rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)] overflow-hidden h-[655.5px] flex flex-col"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/15">
          <MessageSquare className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </span>
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-bold text-foreground tracking-tight">Novos Chats</h3>
          <Tooltip>
            <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground/50 cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-[200px] text-xs">Volume de novos chats criados por período.</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <p className="mb-4 ml-11 -mt-1 text-[11px] text-muted-foreground">Quantidade de chats iniciados por período</p>

      <div className="flex-1 flex flex-col justify-center gap-3 min-h-0">
      <div className="space-y-3">
        {items.map((item, i) => {
          const up = item.trend >= 0;
          const gid = `vol-spark-${i}`;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: -8, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 200, damping: 20 }}
              className={`group relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br ${item.tint} to-transparent dark:from-white/[0.03] dark:to-transparent p-3.5 transition-all duration-300 hover:-translate-y-1 hover:shadow-md`}
            >
              {/* Glow difuso no hover */}
              <div className="pointer-events-none absolute -bottom-6 right-8 h-12 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-30" style={{ background: item.stroke }} />
              {/* Shimmer sweep no hover */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.iconBg} transition-transform duration-300 group-hover:scale-110`}>
                    <item.icon className={`h-4 w-4 ${item.iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <div className="text-2xl font-bold tabular-nums text-foreground leading-tight">
                      <AnimatedCounter value={item.value} duration={900} />
                    </div>
                    <p className={`flex items-center gap-1 text-[11px] font-medium ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {up ? '↑' : '↓'} {Math.abs(item.trend).toFixed(1)}%
                      <span className="text-muted-foreground/70 font-normal">{item.sub}</span>
                    </p>
                  </div>
                </div>

                {/* Mini gráfico de linha */}
                <svg className="h-12 w-28 shrink-0" viewBox="0 0 300 80" preserveAspectRatio="none" fill="none">
                  <defs>
                    <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={item.fill} stopOpacity="0.35" />
                      <stop offset="100%" stopColor={item.fill} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={`${sparkPath(item.series)} L300,80 L0,80 Z`} fill={`url(#${gid})`} />
                  <motion.path
                    d={sparkPath(item.series)}
                    stroke={item.stroke} strokeWidth={3} strokeLinecap="round" fill="none"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 1, ease: 'easeInOut' }}
                  />
                  {/* Ponto final pulsante */}
                  {(() => {
                    const lastY = sparkPath(item.series).match(/[\d.]+,[\d.]+$/) ? parseFloat(sparkPath(item.series).split(' ').pop()!.split(',')[1]) : 12;
                    return (
                      <>
                        <motion.circle cx="296" cy={lastY} r="7" fill={item.stroke} opacity={0.25}
                          animate={{ r: [5, 10, 5], opacity: [0.3, 0, 0.3] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 1 + i * 0.1 }} />
                        <motion.circle cx="296" cy={lastY} r="4" fill={item.stroke}
                          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.2 + i * 0.1, type: 'spring' }} />
                      </>
                    );
                  })()}
                </svg>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Total geral no período */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/15">
            <BarChart3 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total geral no período</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-foreground"><AnimatedCounter value={data.total} duration={1000} /></span>
              <span className={`flex items-center gap-0.5 text-[11px] font-medium ${data.totalTrend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                {data.totalTrend >= 0 ? '↑' : '↓'} {Math.abs(data.totalTrend).toFixed(1)}%
                <span className="text-muted-foreground/70 font-normal">vs período anterior</span>
              </span>
            </div>
          </div>
        </div>
        {/* Mini barras */}
        <div className="flex items-end gap-0.5 h-8">
          {data.monthByDay.slice(-8).map((v, i) => {
            const max = Math.max(1, ...data.monthByDay);
            return (
              <motion.div
                key={i}
                className="w-1.5 rounded-full bg-violet-400/60"
                initial={{ height: 0 }} animate={{ height: `${Math.max(15, (v / max) * 100)}%` }}
                transition={{ delay: 0.5 + i * 0.04, duration: 0.5 }}
              />
            );
          })}
        </div>
      </div>
      </div>
    </motion.div>
  );
};

export default VolumePanel;
