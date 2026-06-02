import { useMemo, useState } from 'react';
import { Card, Session } from '@/api/helena';
import { classifyStep } from '@/utils/normalizeStep';
import { formatPercent } from '@/utils/formatters';
import { GitCompareArrows } from 'lucide-react';

interface CampaignComparisonProps {
  cards: Card[];
  sessions: Session[];
}

interface CampaignMetrics {
  name: string;
  leads: number;
  qualificationRate: number;
  conversionRate: number;
  contracts: number;
  avgTimeDays: number | null;
}

const CampaignComparison = ({ cards, sessions }: CampaignComparisonProps) => {
  const allCampaigns = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.utmCampaign) set.add(s.utmCampaign);
    }
    return Array.from(set).sort();
  }, [sessions]);

  const [selected, setSelected] = useState<string[]>([]);

  const metrics = useMemo(() => {
    if (selected.length < 2) return [];

    const cardMap = new Map(cards.filter(c => !c.archived).map(c => [c.id, c]));

    return selected.map(campaign => {
      const campSessions = sessions.filter(s => s.utmCampaign === campaign);
      let leads = 0, qualified = 0, won = 0;
      const times: number[] = [];

      for (const s of campSessions) {
        const card = cardMap.get(s.cardId);
        if (!card) continue;
        leads++;
        const step = classifyStep(card.stepTitle);
        if (['CLOSER', 'CONTRATO', 'ETAPA DE ASSINATURA', 'CONTRATO FECHADO'].includes(step)) qualified++;
        if (step === 'CONTRATO FECHADO') {
          won++;
          if (s.sessionCreatedAt) {
            const diff = new Date(card.updatedAt).getTime() - new Date(s.sessionCreatedAt).getTime();
            if (diff > 0) times.push(diff);
          }
        }
      }

      return {
        name: campaign,
        leads,
        qualificationRate: leads > 0 ? (qualified / leads) * 100 : 0,
        conversionRate: leads > 0 ? (won / leads) * 100 : 0,
        contracts: won,
        avgTimeDays: times.length > 0 ? (times.reduce((a, b) => a + b, 0) / times.length) / (1000 * 60 * 60 * 24) : null,
      } as CampaignMetrics;
    });
  }, [selected, cards, sessions]);

  const toggleCampaign = (name: string) => {
    setSelected(prev => {
      if (prev.includes(name)) return prev.filter(c => c !== name);
      if (prev.length >= 3) return prev;
      return [...prev, name];
    });
  };

  const getBest = (key: keyof CampaignMetrics, higher = true) => {
    if (metrics.length === 0) return '';
    const values = metrics.map(m => m[key] as number);
    const best = higher ? Math.max(...values) : Math.min(...values.filter(v => v !== null));
    return metrics.find(m => (m[key] as number) === best)?.name || '';
  };

  const METRIC_ROWS: { label: string; key: keyof CampaignMetrics; format: (v: any) => string; higherIsBetter: boolean }[] = [
    { label: 'Total de Leads', key: 'leads', format: (v: number) => String(v), higherIsBetter: true },
    { label: 'Taxa Qualificação', key: 'qualificationRate', format: (v: number) => formatPercent(v), higherIsBetter: true },
    { label: 'Taxa Conversão', key: 'conversionRate', format: (v: number) => formatPercent(v), higherIsBetter: true },
    { label: 'Contratos', key: 'contracts', format: (v: number) => String(v), higherIsBetter: true },
    { label: 'Tempo Médio', key: 'avgTimeDays', format: (v: number | null) => v !== null ? `${v.toFixed(1)} dias` : '—', higherIsBetter: false },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="mb-1 flex items-center gap-2">
        <GitCompareArrows className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Comparação de Campanhas</h3>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">Selecione 2 ou 3 campanhas para comparar</p>

      {/* Selector */}
      <div className="mb-4 flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
        {allCampaigns.map(c => (
          <button
            key={c}
            onClick={() => toggleCampaign(c)}
            className={`rounded-full px-2.5 py-1 text-[11px] border transition-colors ${
              selected.includes(c)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {c.length > 35 ? c.slice(0, 35) + '…' : c}
          </button>
        ))}
      </div>

      {/* Comparison table */}
      {metrics.length >= 2 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 text-left text-xs font-medium text-muted-foreground">Métrica</th>
                {metrics.map(m => (
                  <th key={m.name} className="py-2 text-right text-xs font-medium text-foreground max-w-[180px] truncate">
                    {m.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map(row => {
                const bestName = getBest(row.key, row.higherIsBetter);
                return (
                  <tr key={row.label} className="border-b border-border/50">
                    <td className="py-2.5 text-xs text-muted-foreground">{row.label}</td>
                    {metrics.map(m => (
                      <td
                        key={m.name}
                        className={`py-2.5 text-right text-sm font-medium tabular-nums ${
                          m.name === bestName ? 'text-green-500' : 'text-foreground'
                        }`}
                      >
                        {row.format(m[row.key])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected.length < 2 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Selecione pelo menos 2 campanhas acima para ver a comparação
        </p>
      )}
    </div>
  );
};

export default CampaignComparison;
