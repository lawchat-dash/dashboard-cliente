import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { FUNNEL_STEPS, getStepDisplayName } from '@/utils/normalizeStep';
import { formatPercent } from '@/utils/formatters';
import { Trophy, Info, Users, UserCheck, Search, FileText, PenLine } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SalesFunnelProps {
  cards: Card[];
  activeSteps?: string[];
}

// Cada etapa: gradiente + cor sólida (pra glow) + ícone — cores distintas (igual referência)
const STAGE_META: Record<string, { from: string; to: string; glow: string; icon: any }> = {
  'SDR':                 { from: '#3b82f6', to: '#1d4ed8', glow: '#3b82f6', icon: Users },
  'CLOSER':              { from: '#22d3ee', to: '#0891b2', glow: '#06b6d4', icon: UserCheck },
  'ANALISE MANUAL':      { from: '#a78bfa', to: '#6d28d9', glow: '#8b5cf6', icon: Search },
  'CONTRATO':            { from: '#fb923c', to: '#ea580c', glow: '#f97316', icon: FileText },
  'ETAPA DE ASSINATURA': { from: '#34d399', to: '#15803d', glow: '#16a34a', icon: PenLine },
  'CONTRATO FECHADO':    { from: '#fbbf24', to: '#f59e0b', glow: '#f59e0b', icon: Trophy },
};

const SalesFunnel = ({ cards, activeSteps = [] }: SalesFunnelProps) => {
  const { classify } = useClassify();

  const { stages, totalLeads } = useMemo(() => {
    const allFunnelSteps = FUNNEL_STEPS.filter((s) => s !== 'DESQUALIFICADO' && s !== 'NAO ASSINOU');
    const visibleSteps = activeSteps.length > 0
      ? allFunnelSteps.filter(s => activeSteps.includes(s))
      : allFunnelSteps;

    const nonArchived = cards.filter((c) => !c.archived);
    const total = nonArchived.length;
    const count = visibleSteps.length;

    const result = visibleSteps.map((step, i) => {
      const stepCount = nonArchived.filter((c) => classify(c) === step).length;
      // Largura decrescente: 100% no topo até ~42% na base
      const widthPct = count <= 1 ? 100 : 100 - (i * (58 / (count - 1)));
      const meta = STAGE_META[step] || STAGE_META['SDR'];
      return {
        step,
        count: stepCount,
        widthPct,
        pctOfTotal: total > 0 ? (stepCount / total) * 100 : 0,
        ...meta,
      };
    });

    // Calcula taxa de conversão de uma etapa pra próxima
    const withConv = result.map((s, i) => {
      const prev = i > 0 ? result[i - 1] : null;
      const dropRate = prev && prev.count > 0 ? (s.count / prev.count) * 100 : null;
      return { ...s, dropRate };
    });

    return { stages: withConv, totalLeads: total };
  }, [cards, activeSteps, classify]);

  return (
    <div className="relative rounded-2xl border border-border/60 bg-card p-5 md:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden h-full flex flex-col lg:min-h-[700px]">
      {/* Header */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-base md:text-lg font-bold text-foreground tracking-tight">Funil de Vendas</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[220px] text-xs">
              Visualização do fluxo de leads por etapa. A largura representa a proporção relativa.
            </TooltipContent>
          </Tooltip>
        </div>
        {totalLeads > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1">
            <span className="text-[11px] font-medium text-muted-foreground">Total</span>
            <span className="text-sm font-bold text-foreground tabular-nums">{totalLeads.toLocaleString('pt-BR')}</span>
          </div>
        )}
      </div>
      <p className="mb-6 text-[11px] text-muted-foreground">Visualização do fluxo de leads por etapa</p>

      {/* Funil — flex-1 + justify-center: as barras distribuem e preenchem a altura
          do card (alinha com o card de Anúncios ao lado, sem espaço vazio embaixo) */}
      <div className="relative flex-1 flex flex-col items-center justify-center gap-5">
        {stages.map((stage, i) => {
          const Icon = stage.icon;
          return (
            <motion.div
              key={stage.step}
              initial={{ opacity: 0, scaleX: 0.5, y: 8 }}
              animate={{ opacity: 1, scaleX: 1, y: 0 }}
              transition={{ delay: i * 0.08, type: 'spring', stiffness: 140, damping: 18 }}
              className="group relative flex justify-center"
              style={{ width: `${stage.widthPct}%` }}
            >
              {/* Badge de conversão flutuante (não afeta o layout) */}
              {i > 0 && stage.dropRate !== null && (
                <span className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border/60 bg-card px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground/80 tabular-nums shadow-sm">
                  {formatPercent(stage.dropRate)}
                </span>
              )}

              {/* Glow por trás (suave) */}
              <div
                className="absolute -inset-0.5 rounded-xl opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-20"
                style={{ background: `linear-gradient(135deg, ${stage.from}, ${stage.to})` }}
              />

              <div
                className="relative flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-white transition-all duration-300 group-hover:-translate-y-0.5"
                style={{
                  background: `linear-gradient(135deg, ${stage.from}, ${stage.to})`,
                  boxShadow: `0 2px 8px -3px ${stage.glow}40`,
                }}
              >
                {/* Brilho diagonal sutil no topo */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-xl bg-gradient-to-b from-white/12 to-transparent" />

                {/* Label + ícone */}
                <span className="relative flex items-center gap-2 font-semibold truncate min-w-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/20">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate text-xs md:text-sm">{getStepDisplayName(stage.step)}</span>
                </span>

                {/* Valor */}
                <span className="relative flex items-baseline gap-1 shrink-0 tabular-nums">
                  <span className="text-base md:text-xl font-bold drop-shadow-sm">{stage.count.toLocaleString('pt-BR')}</span>
                  <span className="text-[10px] md:text-xs font-medium opacity-80">
                    ({formatPercent(stage.pctOfTotal)})
                  </span>
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Footer: conversão total */}
      {stages.length >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: stages.length * 0.08 + 0.15 }}
          className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-4 py-2.5"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/15">
            <Trophy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-xs text-muted-foreground">Conversão geral</span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatPercent(totalLeads > 0 ? ((stages[stages.length - 1]?.count || 0) / totalLeads) * 100 : 0)}
          </span>
          <span className="text-[11px] text-muted-foreground/60">
            ({stages[stages.length - 1]?.count.toLocaleString('pt-BR')} de {totalLeads.toLocaleString('pt-BR')})
          </span>
        </motion.div>
      )}
    </div>
  );
};

export default SalesFunnel;
