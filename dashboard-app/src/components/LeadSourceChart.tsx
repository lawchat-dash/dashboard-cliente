import { useMemo } from 'react';
import { Session, Card } from '@/api/helena';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion } from 'framer-motion';
import { PieChart as PieIcon, Sparkles } from 'lucide-react';
import AnimatedCounter from '@/components/AnimatedCounter';

interface LeadSourceChartProps {
  sessions: Session[];
  cards: Card[];
}

const PLATFORM_COLORS: Record<string, string> = {
  INSTAGRAM: 'hsl(330, 80%, 55%)',
  FACEBOOK: 'hsl(217, 91%, 60%)',
  GOOGLE: 'hsl(43, 96%, 50%)',
  YOUTUBE: 'hsl(0, 80%, 55%)',
  Outro: 'hsl(187, 72%, 45%)',
};

const DISPLAY_NAMES: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  GOOGLE: 'Google Ads',
  YOUTUBE: 'YouTube',
};

const LeadSourceChart = ({ sessions, cards }: LeadSourceChartProps) => {
  const filteredCardIds = useMemo(() => {
    return new Set(cards.filter(c => !c.archived).map(c => c.id));
  }, [cards]);

  // Align with BestAdsRanking: only sessions that have utmSource AND (utmSourceId or utmCampaign)
  const relevantSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions.filter(s =>
      s.cardId &&
      filteredCardIds.has(s.cardId) &&
      s.utmSource &&
      (s.utmSourceId || s.utmCampaign)
    );
  }, [sessions, filteredCardIds]);

  const data = useMemo(() => {
    const counts = new Map<string, number>();
    if (relevantSessions.length === 0) return [];

    // Deduplicate: count each card only once
    const seenCards = new Set<string>();
    let totalCounted = 0;
    relevantSessions.forEach(s => {
      if (!s.cardId || seenCards.has(s.cardId)) return;
      seenCards.add(s.cardId);
      totalCounted++;
      const src = s.utmSource?.toUpperCase() || '';
      let key: string;
      if (src.includes('INSTAGRAM')) key = 'INSTAGRAM';
      else if (src.includes('FACEBOOK')) key = 'FACEBOOK';
      else if (src.includes('GOOGLE')) key = 'GOOGLE';
      else if (src.includes('YOUTUBE')) key = 'YOUTUBE';
      else key = 'Outro';
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const total = totalCounted;
    return Array.from(counts.entries())
      .map(([name, value]) => ({
        name: DISPLAY_NAMES[name] || name,
        rawKey: name,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [relevantSessions]);

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const topSource = data[0];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-[0_1px_3px_rgba(15,23,42,0.05)] flex flex-col h-[655.5px]">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/15">
          <PieIcon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </span>
        <h3 className="text-base font-bold text-foreground tracking-tight">Origem dos Leads</h3>
      </div>
      <p className="mb-5 ml-11 -mt-1 text-[11px] text-muted-foreground">De onde seus leads estão vindo</p>
      <div className="flex-1 flex flex-col justify-center gap-5 min-h-0">
      <div className="flex flex-col items-center gap-6 md:flex-row">
        <div className="relative h-56 w-56 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map(entry => (
                  <Cell key={entry.name} fill={PLATFORM_COLORS[entry.rawKey] || 'hsl(220, 10%, 70%)'} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [`${value} leads`, name]}
                contentStyle={{ borderRadius: 8, fontSize: 13 }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Total no centro */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] text-muted-foreground">Total</span>
            <span className="text-3xl font-bold tabular-nums text-foreground"><AnimatedCounter value={total} duration={1000} /></span>
            <span className="text-[11px] text-muted-foreground">leads</span>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          {data.map((item, i) => {
            const c = PLATFORM_COLORS[item.rawKey] || 'hsl(220, 10%, 70%)';
            return (
              <div key={item.name} className="group">
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="h-3 w-3 rounded-full flex-shrink-0 transition-transform group-hover:scale-125" style={{ backgroundColor: c, boxShadow: `0 0 8px ${c}66` }} />
                  <span className="flex-1 text-sm text-foreground">{item.name}</span>
                  <span className="text-lg font-bold text-foreground tabular-nums">
                    <AnimatedCounter value={item.value} duration={900} />
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{item.pct.toFixed(1)}%</span>
                </div>
                {/* Barra de proporção animada */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${c}99, ${c})` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${item.pct}%` }}
                    transition={{ delay: 0.3 + i * 0.12, duration: 0.9, ease: 'easeOut' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Painel Insights */}
      {topSource && (
        <div className="rounded-xl border border-violet-200/50 bg-violet-50/40 dark:border-violet-500/15 dark:bg-violet-500/[0.06] p-3.5">
          <div className="flex items-start gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/20">
              <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </span>
            <div>
              <p className="text-xs font-semibold text-foreground mb-0.5">Insights</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <strong className="text-foreground">{topSource.name}</strong> permanece como principal origem de leads,
                responsável por <strong className="text-foreground">{topSource.pct.toFixed(1)}%</strong> do total no período.
              </p>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default LeadSourceChart;
