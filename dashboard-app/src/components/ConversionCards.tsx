import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { getStepDisplayName } from '@/utils/normalizeStep';
import { formatPercent } from '@/utils/formatters';
import { ArrowRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ConversionCardsProps {
  cards: Card[];
}

const CONVERSION_PAIRS = [
  { from: 'SDR', to: 'CLOSER', label: 'SDR → Closer', color: 'hsl(217, 91%, 60%)' },
  { from: 'CLOSER', to: 'CONTRATO', label: 'Closer → Contrato', color: 'hsl(187, 72%, 45%)' },
  { from: 'CONTRATO', to: 'ETAPA DE ASSINATURA', label: 'Contrato → Assinatura', color: 'hsl(32, 95%, 52%)' },
  { from: 'ETAPA DE ASSINATURA', to: 'CONTRATO FECHADO', label: 'Assinatura → Fechado', color: 'hsl(134, 60%, 42%)' },
];

const ConversionCards = ({ cards }: ConversionCardsProps) => {
  const { classify } = useClassify();

  const conversions = useMemo(() => {
    const nonArchived = cards.filter(c => !c.archived);
    const totalLeads = nonArchived.length;
    const stepCounts = new Map<string, number>();

    nonArchived.forEach(c => {
      const step = classify(c);
      stepCounts.set(step, (stepCounts.get(step) || 0) + 1);
    });

    return CONVERSION_PAIRS.map(({ from, to, label, color }) => {
      const fromCount = stepCounts.get(from) || 0;
      const toCount = stepCounts.get(to) || 0;
      const rate = totalLeads > 0 ? (toCount / totalLeads) * 100 : 0;
      return { label, fromCount, toCount, rate, from, to, totalLeads, color };
    });
  }, [cards, classify]);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {conversions.map((conv, i) => (
        <motion.div
          key={conv.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-shadow hover:shadow-card-hover"
          style={{ borderLeftWidth: 3, borderLeftColor: conv.color }}
        >
          <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span>{getStepDisplayName(conv.from)}</span>
            <ArrowRight className="h-3 w-3" style={{ color: conv.color }} />
            <span>{getStepDisplayName(conv.to)}</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-default">
                <span className="text-3xl font-bold text-foreground">{formatPercent(conv.rate)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p><span className="font-semibold">{conv.toCount}</span> de <span className="font-semibold">{conv.totalLeads}</span> leads totais</p>
            </TooltipContent>
          </Tooltip>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: conv.color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(conv.rate, 100)}%` }}
              transition={{ delay: i * 0.06 + 0.2, duration: 0.6 }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default ConversionCards;
