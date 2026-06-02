import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { FUNNEL_STEPS, getStepDisplayName } from '@/utils/normalizeStep';
import { formatPercent } from '@/utils/formatters';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AuditModal from '@/components/AuditModal';
import AnimatedCounter from '@/components/AnimatedCounter';

interface StageMetricsProps {
  cards: Card[];
  sessions: Session[];
}

// Estilo por etapa: dot + tint pastel de fundo + cor da mini-curva
const STAGE_STYLE: Record<string, { dot: string; tint: string; spark: string; valueColor?: string }> = {
  'SDR':                  { dot: '#3b82f6', tint: 'from-blue-50/70',    spark: '#3b82f6' },
  'CLOSER':               { dot: '#06b6d4', tint: 'from-cyan-50/70',    spark: '#06b6d4' },
  'ANALISE MANUAL':       { dot: '#a855f7', tint: 'from-purple-50/70',  spark: '#a855f7' },
  'CONTRATO':             { dot: '#f59e0b', tint: 'from-amber-50/70',   spark: '#f59e0b' },
  'ETAPA DE ASSINATURA':  { dot: '#16a34a', tint: 'from-green-50/70',   spark: '#16a34a' },
  'CONTRATO FECHADO':     { dot: '#15bf41', tint: 'from-emerald-50/70', spark: '#15bf41', valueColor: 'text-emerald-600 dark:text-emerald-400' },
  'DESQUALIFICADO':       { dot: '#ef4444', tint: 'from-rose-50/70',    spark: '#ef4444' },
  'NAO ASSINOU':          { dot: '#ec4899', tint: 'from-pink-50/70',    spark: '#ec4899' },
};

const STAGE_TOOLTIPS: Record<string, string> = {
  'SDR': 'Leads na fase inicial de qualificação pelo time de SDR.',
  'CLOSER': 'Leads qualificados sendo atendidos pelo closer.',
  'ANALISE MANUAL': 'Leads em análise manual após a etapa de closer.',
  'CONTRATO': 'Leads em fase de negociação de contrato.',
  'ETAPA DE ASSINATURA': 'Leads aguardando assinatura do contrato.',
  'CONTRATO FECHADO': 'Leads que assinaram e fecharam o contrato.',
  'DESQUALIFICADO': 'Leads que não se encaixaram no perfil.',
  'NAO ASSINOU': 'Leads que tiveram contrato mas não assinaram.',
};

// Curva suave ascendente do mini sparkline (viewBox 60x24)
const MINI_CURVE = 'M2,20 C12,18 20,14 30,10 C38,7 48,5 58,3';

const StageMetrics = ({ cards, sessions }: StageMetricsProps) => {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const { classify } = useClassify();

  const data = useMemo(() => {
    const nonArchived = cards.filter(c => !c.archived);
    const total = nonArchived.length;
    const counts = FUNNEL_STEPS.map(step => {
      const count = nonArchived.filter(c => classify(c) === step).length;
      return { step, count, pctOfTotal: total > 0 ? (count / total) * 100 : 0 };
    });
    return { counts };
  }, [cards, classify]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {data.counts.map((item, i) => {
          const s = STAGE_STYLE[item.step] || STAGE_STYLE['SDR'];
          const tip = STAGE_TOOLTIPS[item.step] || '';
          const gid = `mini-${item.step.replace(/\s/g, '')}-${i}`;
          return (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setSelectedStage(item.step)}
              className={`group relative cursor-pointer overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br ${s.tint} to-transparent dark:from-white/[0.03] dark:to-transparent transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm`}
            >
              <div className="px-4 py-3.5">
                {/* Header: dot + label + info */}
                <div className="flex items-center gap-1.5 mb-2.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
                  <span className="text-[11px] font-medium text-foreground/75 truncate">
                    {getStepDisplayName(item.step)}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-2.5 w-2.5 text-muted-foreground/40 cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">{tip}</TooltipContent>
                  </Tooltip>
                </div>

                {/* Número + % + mini sparkline curvo no canto */}
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <div className={`text-2xl font-bold leading-none tracking-tight tabular-nums ${s.valueColor || 'text-foreground'}`}>
                      <AnimatedCounter value={item.count} duration={900} />
                    </div>
                    <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                      {formatPercent(item.pctOfTotal)} do total
                    </p>
                  </div>

                  {/* Mini sparkline curvo (suave, na cor da etapa) */}
                  <svg
                    className="h-5 w-[52px] shrink-0 transition-transform duration-300 group-hover:scale-110"
                    viewBox="0 0 60 24"
                    fill="none"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.spark} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={s.spark} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={`${MINI_CURVE} L58,24 L2,24 Z`} fill={`url(#${gid})`} />
                    <motion.path
                      d={MINI_CURVE}
                      stroke={s.spark}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      fill="none"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: i * 0.04 + 0.25, duration: 0.7, ease: 'easeInOut' }}
                    />
                  </svg>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AuditModal
        open={!!selectedStage}
        onOpenChange={(open) => { if (!open) setSelectedStage(null); }}
        mode="all"
        cards={cards}
        sessions={sessions}
        initialStage={selectedStage || undefined}
      />
    </div>
  );
};

export default StageMetrics;
