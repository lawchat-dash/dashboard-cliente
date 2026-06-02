import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { getStepDisplayName } from '@/utils/normalizeStep';
import { formatPercent } from '@/utils/formatters';
import { Clock } from 'lucide-react';

interface StageDistributionProps {
  cards: Card[];
  onStageClick?: (step: string) => void;
}

const STEP_COLORS: Record<string, string> = {
  'SDR': 'bg-funnel-1',
  'CLOSER': 'bg-funnel-2',
  'CONTRATO': 'bg-funnel-3',
  'ETAPA DE ASSINATURA': 'bg-funnel-4',
  'CONTRATO FECHADO': 'bg-funnel-5',
  'DESQUALIFICADO': 'bg-funnel-6',
};

const STEP_EMOJIS: Record<string, string> = {
  'SDR': '📞',
  'CLOSER': '🎯',
  'CONTRATO': '📝',
  'ETAPA DE ASSINATURA': '✍️',
  'CONTRATO FECHADO': '✅',
  'DESQUALIFICADO': '❌',
};

const StageDistribution = ({ cards, onStageClick }: StageDistributionProps) => {
  const { classify } = useClassify();

  const stages = useMemo(() => {
    const nonArchived = cards.filter(c => !c.archived);
    const total = nonArchived.length || 1;

    const stepCounts = new Map<string, number>();
    nonArchived.forEach(c => {
      const step = classify(c);
      stepCounts.set(step, (stepCounts.get(step) || 0) + 1);
    });

    return Array.from(stepCounts.entries())
      .map(([step, count]) => ({
        step,
        count,
        pct: (count / total) * 100,
        emoji: STEP_EMOJIS[step] || '📋',
        colorClass: STEP_COLORS[step] || 'bg-primary',
      }))
      .sort((a, b) => b.count - a.count);
  }, [cards, classify]);

  const maxCount = stages[0]?.count || 1;

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold text-foreground">
        <Clock className="h-5 w-5 text-muted-foreground" />
        Distribuição por Etapas
      </h3>
      <div className="space-y-3">
        {stages.map((stage, i) => (
          <motion.div
            key={stage.step}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="cursor-pointer"
            onClick={() => onStageClick?.(stage.step)}
          >
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">
                {stage.emoji} {getStepDisplayName(stage.step)}
              </span>
              <span className="text-muted-foreground">
                {stage.count} ({formatPercent(stage.pct)})
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <motion.div
                className={`h-full rounded-full ${stage.colorClass}`}
                initial={{ width: 0 }}
                animate={{ width: `${(stage.count / maxCount) * 100}%` }}
                transition={{ delay: i * 0.05 + 0.2, duration: 0.5 }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default StageDistribution;
