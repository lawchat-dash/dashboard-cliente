import { useMemo } from 'react';
import { Card, Session } from '@/api/helena';
import { PieChart as PieChartIcon } from 'lucide-react';

interface CampaignChartsProps {
  cards: Card[];
  sessions: Session[];
}

const PLATFORM_COLORS: Record<string, string> = {
  Instagram: 'bg-pink-500',
  Facebook: 'bg-blue-500',
  Google: 'bg-yellow-500',
  YouTube: 'bg-red-500',
  Outro: 'bg-muted-foreground',
};

const PLATFORM_TEXT: Record<string, string> = {
  Instagram: 'text-pink-500',
  Facebook: 'text-blue-500',
  Google: 'text-yellow-500',
  YouTube: 'text-red-500',
  Outro: 'text-muted-foreground',
};

const CampaignCharts = ({ cards, sessions }: CampaignChartsProps) => {
  const pieData = useMemo(() => {
    const sessionsWithUtm = sessions.filter(s => s.utmCampaign || s.utmSource);
    const platformMap = new Map<string, number>();

    for (const s of sessionsWithUtm) {
      const source = (s.utmSource || 'Direto').toLowerCase();
      let platform = 'Outro';
      if (source.includes('instagram')) platform = 'Instagram';
      else if (source.includes('facebook') || source.includes('fb')) platform = 'Facebook';
      else if (source.includes('google')) platform = 'Google';
      else if (source.includes('youtube')) platform = 'YouTube';
      platformMap.set(platform, (platformMap.get(platform) || 0) + 1);
    }

    const total = Array.from(platformMap.values()).reduce((a, b) => a + b, 0);

    return Array.from(platformMap.entries())
      .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [sessions]);

  const total = pieData.reduce((sum, d) => sum + d.value, 0);

  if (pieData.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center gap-2">
        <PieChartIcon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Distribuição por Plataforma</h3>
      </div>

      {/* Donut visual */}
      <div className="flex items-center justify-center mb-5">
        <div className="relative h-40 w-40">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            {(() => {
              let offset = 0;
              const gap = 2;
              const totalWithGaps = 100 - (pieData.length * gap);
              return pieData.map((d) => {
                const pct = (d.value / total) * totalWithGaps;
                const color = d.name === 'Instagram' ? '#ec4899'
                  : d.name === 'Facebook' ? '#3b82f6'
                  : d.name === 'Google' ? '#eab308'
                  : d.name === 'YouTube' ? '#ef4444'
                  : '#94a3b8';
                const el = (
                  <circle
                    key={d.name}
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke={color}
                    strokeWidth="12"
                    strokeDasharray={`${pct} ${100 - pct}`}
                    strokeDashoffset={-offset}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                );
                offset += pct + gap;
                return el;
              });
            })()}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{total}</span>
            <span className="text-[10px] text-muted-foreground">leads</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2">
        {pieData.map((d) => (
          <div key={d.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${PLATFORM_COLORS[d.name] || 'bg-muted'}`} />
              <span className="text-sm text-foreground">{d.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold tabular-nums ${PLATFORM_TEXT[d.name] || 'text-muted-foreground'}`}>
                {d.value}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                {d.pct.toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CampaignCharts;
