import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { getStepDisplayName } from '@/utils/normalizeStep';
import { formatPercent } from '@/utils/formatters';
import { Trophy, Filter } from 'lucide-react';

interface CampaignFunnelProps {
  cards: Card[];
  sessions: Session[];
}

const FUNNEL_ORDER = ['SDR', 'CLOSER', 'ANALISE MANUAL', 'CONTRATO', 'ETAPA DE ASSINATURA', 'CONTRATO FECHADO'] as const;

const FUNNEL_COLORS = [
  'linear-gradient(135deg, hsl(217, 91%, 50%), hsl(217, 91%, 42%))',
  'linear-gradient(135deg, hsl(187, 85%, 40%), hsl(187, 85%, 32%))',
  'linear-gradient(135deg, hsl(245, 58%, 51%), hsl(245, 58%, 43%))',
  'linear-gradient(135deg, hsl(32, 95%, 48%), hsl(32, 95%, 40%))',
  'linear-gradient(135deg, hsl(134, 60%, 42%), hsl(134, 60%, 34%))',
  'linear-gradient(135deg, hsl(43, 96%, 56%), hsl(43, 96%, 46%))',
];

const WIDTHS = [100, 85, 70, 58, 45, 35];

interface TooltipData {
  step: string;
  count: number;
  topCampaigns: { name: string; count: number }[];
  x: number;
  y: number;
}

const CampaignFunnel = ({ cards, sessions }: CampaignFunnelProps) => {
  const { classify } = useClassify();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const { stages, campaignsByStep } = useMemo(() => {
    const sessionCardIds = new Set(
      sessions.filter(s => s.utmCampaign || s.utmSource).map(s => s.cardId)
    );

    // Map cardId -> campaigns
    const cardCampaigns = new Map<string, string>();
    for (const s of sessions) {
      if (s.cardId && s.utmCampaign) {
        cardCampaigns.set(s.cardId, s.utmCampaign);
      }
    }

    const relevantCards = cards.filter(c => !c.archived && sessionCardIds.has(c.id));

    const counts: Record<string, number> = {};
    const campaignsByStep = new Map<string, Map<string, number>>();

    for (const card of relevantCards) {
      const step = classify(card);
      if (FUNNEL_ORDER.includes(step as any)) {
        counts[step] = (counts[step] || 0) + 1;

        const campaign = cardCampaigns.get(card.id) || 'Sem campanha';
        if (!campaignsByStep.has(step)) campaignsByStep.set(step, new Map());
        const stepMap = campaignsByStep.get(step)!;
        stepMap.set(campaign, (stepMap.get(campaign) || 0) + 1);
      }
    }

    const total = relevantCards.length;

    const stages = FUNNEL_ORDER.map((step, i) => ({
      step,
      count: counts[step] || 0,
      widthPct: WIDTHS[i],
      pctOfTotal: total > 0 ? ((counts[step] || 0) / total) * 100 : 0,
      gradient: FUNNEL_COLORS[i],
    }));

    return { stages, campaignsByStep };
  }, [cards, sessions]);

  const hasData = stages.some(s => s.count > 0);

  const handleMouseEnter = (step: string, count: number, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const parentRect = e.currentTarget.closest('.relative')?.getBoundingClientRect();
    const stepCampaigns = campaignsByStep.get(step);
    const topCampaigns = stepCampaigns
      ? Array.from(stepCampaigns.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
      : [];

    setTooltip({
      step,
      count,
      topCampaigns,
      x: rect.left - (parentRect?.left || 0) + rect.width / 2,
      y: rect.top - (parentRect?.top || 0) - 8,
    });
  };

  return (
    <div className="relative rounded-2xl border border-border/60 bg-card p-5 md:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)] h-full overflow-hidden">
      <div className="mb-1 flex items-center gap-2">
        <Filter className="h-4 w-4 text-primary shrink-0" />
        <h3 className="text-sm font-semibold text-foreground">Funil de Conversão por Campanha</h3>
      </div>
      <p className="mb-4 text-[11px] text-muted-foreground">Jornada dos leads com dados UTM · passe o mouse para ver campanhas</p>

      {!hasData ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Sem dados de funil para a campanha selecionada</p>
      ) : (
        <div className="flex flex-col items-center gap-2.5">
          <AnimatePresence mode="popLayout">
            {stages.map((stage, i) => {
              const prevCount = i > 0 ? stages[i - 1].count : stage.count;
              const dropPct = prevCount > 0 ? ((prevCount - stage.count) / prevCount) * 100 : 0;

              return (
                <div key={stage.step} className="w-full flex flex-col items-center">
                  {i > 0 && dropPct > 0 && (
                    <div className="mb-1 text-[10px] text-muted-foreground">
                      ↓ -{formatPercent(dropPct)} de queda
                    </div>
                  )}
                  <motion.div
                    layout
                    initial={{ opacity: 0, scaleX: 0.6 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0, scaleX: 0.4 }}
                    transition={{ delay: i * 0.05, type: 'spring', stiffness: 120 }}
                    className="w-full"
                    style={{ maxWidth: `${stage.widthPct}%` }}
                    onMouseEnter={(e) => handleMouseEnter(stage.step, stage.count, e)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <div
                      className="flex w-full items-center justify-between rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium text-white shadow-sm transition-all hover:scale-[1.02] hover:shadow-lg cursor-default"
                      style={{ background: stage.gradient }}
                    >
                      <span className="flex items-center gap-1.5 font-semibold truncate min-w-0">
                        {i === stages.length - 1 && <Trophy className="h-3.5 w-3.5 shrink-0" />}
                        <span className="truncate">{getStepDisplayName(stage.step)}</span>
                      </span>
                      <span className="text-sm md:text-lg font-bold tabular-nums shrink-0 ml-2">
                        {stage.count}
                        <span className="text-[10px] md:text-sm font-normal opacity-75 ml-0.5">
                          ({formatPercent(stage.pctOfTotal)})
                        </span>
                      </span>
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none rounded-lg border border-border bg-card px-3 py-2.5 shadow-lg min-w-[200px]"
          style={{
            left: Math.min(tooltip.x, 280),
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="text-xs font-semibold text-foreground mb-1">
            {getStepDisplayName(tooltip.step)} — {tooltip.count} lead{tooltip.count !== 1 ? 's' : ''}
          </p>
          {tooltip.topCampaigns.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground font-medium">Top campanhas:</p>
              {tooltip.topCampaigns.map((c) => (
                <div key={c.name} className="flex justify-between text-[10px] gap-3">
                  <span className="text-foreground truncate max-w-[160px]">{c.name}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CampaignFunnel;
