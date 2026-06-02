import { useMemo, useState } from 'react';
import { Session, Card as HelenaCard } from '@/api/helena';
import { classifyStep } from '@/utils/normalizeStep';
import { Clock } from 'lucide-react';

interface CampaignHeatmapProps {
  sessions: Session[];
  cards: HelenaCard[];
}

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun

function buildGrid(dates: Date[]) {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const d of dates) {
    const day = d.getDay();
    const hour = d.getHours();
    grid[day][hour]++;
    if (grid[day][hour] > max) max = grid[day][hour];
  }
  return { grid, max };
}

function findPeak(grid: number[][]): string {
  let peakDay = 0, peakHour = 0, peakVal = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (grid[d][h] > peakVal) {
        peakVal = grid[d][h];
        peakDay = d;
        peakHour = h;
      }
    }
  }
  if (peakVal === 0) return '—';
  return `${DAYS[peakDay]} ${peakHour}h (${peakVal})`;
}

const getColor = (value: number, max: number, variant: 'blue' | 'green') => {
  if (value === 0 || max === 0) return 'bg-muted/30';
  const intensity = value / max;
  if (variant === 'blue') {
    if (intensity < 0.25) return 'bg-blue-500/20';
    if (intensity < 0.5) return 'bg-blue-500/40';
    if (intensity < 0.75) return 'bg-blue-500/60';
    return 'bg-blue-500/90';
  }
  if (intensity < 0.25) return 'bg-emerald-500/20';
  if (intensity < 0.5) return 'bg-emerald-500/40';
  if (intensity < 0.75) return 'bg-emerald-500/60';
  return 'bg-emerald-500/90';
};

interface TooltipInfo {
  day: string;
  hour: number;
  count: number;
  x: number;
  y: number;
}

const HeatGrid = ({ grid, max, variant, title, peak, label }: {
  grid: number[][];
  max: number;
  variant: 'blue' | 'green';
  title: string;
  peak: string;
  label: string;
}) => {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  return (
    <div className="relative">
      <h4 className="text-xs font-semibold text-foreground mb-1">{title}</h4>
      <p className="text-[10px] text-muted-foreground mb-3">Pico: {peak}</p>
      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: '48px repeat(24, 1fr)' }}>
            <div />
            {HOURS.map(h => (
              <div key={h} className="text-center text-[9px] text-muted-foreground tabular-nums">{h}h</div>
            ))}
          </div>
          {DAY_ORDER.map(dayIdx => (
            <div key={dayIdx} className="grid gap-[2px] mt-[2px]" style={{ gridTemplateColumns: '48px repeat(24, 1fr)' }}>
              <div className="flex items-center text-[11px] font-medium text-muted-foreground">{DAYS[dayIdx]}</div>
              {HOURS.map(h => (
                <div
                  key={h}
                  className={`aspect-square rounded-sm ${getColor(grid[dayIdx][h], max, variant)} flex items-center justify-center transition-colors cursor-default relative`}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const parentRect = e.currentTarget.closest('.relative')?.getBoundingClientRect();
                    setTooltip({
                      day: DAYS[dayIdx],
                      hour: h,
                      count: grid[dayIdx][h],
                      x: rect.left - (parentRect?.left || 0) + rect.width / 2,
                      y: rect.top - (parentRect?.top || 0) - 8,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {grid[dayIdx][h] > 0 && (
                    <span className="text-[8px] font-medium text-foreground/70 tabular-nums">{grid[dayIdx][h]}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div className="mt-2 flex items-center gap-2 justify-end">
            <span className="text-[10px] text-muted-foreground">Menos</span>
            {[0.2, 0.4, 0.6, 0.9].map((o, i) => (
              <div key={i} className={`h-3 w-3 rounded-sm ${variant === 'blue' ? `bg-blue-500/${o * 100}` : `bg-emerald-500/${o * 100}`}`}
                style={{ opacity: o + 0.1 }} />
            ))}
            <span className="text-[10px] text-muted-foreground">Mais</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none rounded-lg border border-border bg-card px-3 py-2 shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="text-xs font-semibold text-foreground">
            {tooltip.day} às {tooltip.hour}h
          </p>
          <p className="text-xs text-muted-foreground">
            {tooltip.count} {label}{tooltip.count !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
};

const CampaignHeatmap = ({ sessions, cards }: CampaignHeatmapProps) => {
  const { leadsGrid, leadsMax, contractsGrid, contractsMax, leadsPeak, contractsPeak } = useMemo(() => {
    const leadDates = sessions
      .filter(s => s.sessionCreatedAt)
      .map(s => new Date(s.sessionCreatedAt!));
    const { grid: leadsGrid, max: leadsMax } = buildGrid(leadDates);

    const sessionCardIds = new Set(sessions.map(s => s.cardId).filter(Boolean));
    const contractDates = cards
      .filter(c => !c.archived && sessionCardIds.has(c.id) && classifyStep(c.stepTitle) === 'CONTRATO FECHADO' && c.updatedAt)
      .map(c => new Date(c.updatedAt));
    const { grid: contractsGrid, max: contractsMax } = buildGrid(contractDates);

    return {
      leadsGrid, leadsMax,
      contractsGrid, contractsMax,
      leadsPeak: findPeak(leadsGrid),
      contractsPeak: findPeak(contractsGrid),
    };
  }, [sessions, cards]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Heatmap de Horários</h3>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <HeatGrid grid={leadsGrid} max={leadsMax} variant="blue" title="Chegada de Leads" peak={leadsPeak} label="lead" />
        <HeatGrid grid={contractsGrid} max={contractsMax} variant="green" title="Fechamento de Contratos" peak={contractsPeak} label="contrato" />
      </div>
    </div>
  );
};

export default CampaignHeatmap;
