import { useMemo } from 'react';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { Timer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface CampaignConversionTimeProps {
  cards: Card[];
  sessions: Session[];
}

const COLORS = [
  'hsl(134, 60%, 42%)',
  'hsl(187, 85%, 40%)',
  'hsl(217, 91%, 50%)',
  'hsl(32, 95%, 48%)',
  'hsl(43, 96%, 56%)',
];

function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return `${days}d ${remainingHours}h`;
}

const CampaignConversionTime = ({ cards, sessions }: CampaignConversionTimeProps) => {
  const { classify } = useClassify();
  const data = useMemo(() => {
    const cardMap = new Map(cards.filter(c => !c.archived).map(c => [c.id, c]));
    const campTimes = new Map<string, number[]>();

    for (const s of sessions) {
      if (!s.utmCampaign || !s.sessionCreatedAt) continue;
      const card = cardMap.get(s.cardId);
      if (!card) continue;
      const step = classify(card);
      if (step !== 'CONTRATO FECHADO') continue;

      const sessionDate = new Date(s.sessionCreatedAt).getTime();
      const closeDate = new Date(card.updatedAt).getTime();
      const diff = closeDate - sessionDate;
      if (diff <= 0) continue;

      const arr = campTimes.get(s.utmCampaign) || [];
      arr.push(diff);
      campTimes.set(s.utmCampaign, arr);
    }

    return Array.from(campTimes.entries())
      .map(([name, times]) => ({
        name: name.length > 30 ? name.slice(0, 30) + '…' : name,
        fullName: name,
        avgMs: times.reduce((a, b) => a + b, 0) / times.length,
        avgDays: (times.reduce((a, b) => a + b, 0) / times.length) / (1000 * 60 * 60 * 24),
        contracts: times.length,
      }))
      .sort((a, b) => a.avgMs - b.avgMs);
  }, [cards, sessions, classify]);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="mb-1 flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Tempo Médio de Conversão</h3>
        </div>
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma campanha com contratos fechados</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-1 flex items-center gap-2">
        <Timer className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Tempo Médio de Conversão</h3>
      </div>
      <p className="mb-4 text-[11px] text-muted-foreground">Do primeiro contato ao contrato assinado (campanhas mais rápidas primeiro)</p>

      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 48)}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
                  <p className="text-xs font-medium text-foreground">{d.fullName}</p>
                  <p className="text-xs text-muted-foreground">Tempo médio: {formatDuration(d.avgMs)}</p>
                  <p className="text-xs text-muted-foreground">{d.contracts} contrato{d.contracts > 1 ? 's' : ''}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="avgDays" radius={[0, 6, 6, 0]} barSize={24}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Ranking list below */}
      <div className="mt-3 space-y-1">
        {data.map((d, i) => (
          <div key={d.fullName} className="flex items-center justify-between text-xs px-1">
            <span className="text-muted-foreground">
              {i + 1}. <span className="text-foreground font-medium">{d.fullName}</span>
            </span>
            <span className="tabular-nums text-foreground font-medium">{formatDuration(d.avgMs)} · {d.contracts} contrato{d.contracts > 1 ? 's' : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CampaignConversionTime;
