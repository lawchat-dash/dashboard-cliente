import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { LayoutGrid, Trophy, TrendingUp, Target, Info, UserCheck } from 'lucide-react';
import { useMemo } from 'react';
import { formatPercent } from '@/utils/formatters';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AuditModal from '@/components/AuditModal';
import AnimatedCounter from '@/components/AnimatedCounter';

interface KPICardsProps {
  cards: Card[];
  sessions: Session[];
}

const QUALIFIED_STAGES = ['CLOSER', 'ANALISE MANUAL', 'CONTRATO', 'ETAPA DE ASSINATURA', 'CONTRATO FECHADO'];

// Curvas decorativas SVG — viewBox 320x80 (mais espaço)
const SPARKS = {
  rising: 'M0,65 C40,62 70,55 110,42 C140,32 180,22 220,15 C250,10 280,7 320,4',
  arch:   'M0,70 C40,55 75,32 130,22 C180,16 230,28 270,38 C290,42 310,48 320,52',
  wave:   'M0,55 C35,38 70,30 105,38 C140,46 175,58 210,52 C245,46 280,28 320,18',
  smooth: 'M0,50 C45,46 90,38 135,30 C180,24 225,22 270,20 C290,19 310,18 320,18',
  steady: 'M0,45 C50,42 100,36 150,33 C200,30 250,30 290,32 C305,33 320,34 320,34',
};

const KPICards = ({ cards, sessions }: KPICardsProps) => {
  const [auditMode, setAuditMode] = useState<'all' | 'closed' | null>(null);
  const { classify } = useClassify();

  const metrics = useMemo(() => {
    const nonArchived = cards.filter(c => !c.archived);
    const total = nonArchived.length;
    const closedCount = nonArchived.filter(c => classify(c) === 'CONTRATO FECHADO').length;
    const sdrCount = nonArchived.filter(c => classify(c) === 'SDR').length;
    const desqualificadoCount = nonArchived.filter(c => { const s = classify(c); return s === 'DESQUALIFICADO' || s === 'NAO ASSINOU'; }).length;
    const generalConversion = total > 0 ? (closedCount / total) * 100 : 0;
    const advancedFromSdr = total - sdrCount - desqualificadoCount;
    const efficiencyRate = advancedFromSdr > 0 ? (closedCount / advancedFromSdr) * 100 : 0;
    const qualifiedCount = nonArchived.filter(c => QUALIFIED_STAGES.includes(classify(c))).length;
    const qualifiedRate = total > 0 ? (qualifiedCount / total) * 100 : 0;
    return { total, closedCount, generalConversion, efficiencyRate, qualifiedCount, qualifiedRate };
  }, [cards, classify]);

  // Cor de cada KPI. No dark mode usamos card sólido com border colorido sutil.
  const kpis = [
    {
      label: 'Cards Totais',
      numValue: metrics.total, isPct: false,
      subtitle: 'no painel',
      icon: LayoutGrid,
      tint: 'bg-blue-50/70 dark:bg-card',
      iconBg: 'bg-blue-100 dark:bg-blue-500/20',
      iconColor: 'text-blue-600 dark:text-blue-300',
      stroke: '#60a5fa',
      gradStops: ['#93c5fd', '#3b82f6'],
      spark: SPARKS.rising,
      tooltip: 'Quantidade total de cards não arquivados.',
      clickable: true,
      auditMode: 'all' as const,
    },
    {
      label: 'Contratos Assinados',
      numValue: metrics.closedCount, isPct: false,
      subtitle: 'contratos assinados',
      icon: Trophy,
      tint: 'bg-emerald-50/70 dark:bg-card',
      iconBg: 'bg-emerald-100 dark:bg-emerald-500/20',
      iconColor: 'text-emerald-600 dark:text-emerald-300',
      stroke: '#15bf41',
      gradStops: ['#86efac', '#15bf41'],
      spark: SPARKS.arch,
      valueColor: 'text-emerald-600 dark:text-emerald-400',
      tooltip: 'Leads que fecharam contrato no período.',
      clickable: true,
      auditMode: 'closed' as const,
    },
    {
      label: 'Taxa de Conversão',
      numValue: metrics.generalConversion, isPct: true,
      subtitle: 'Total → Fechado',
      icon: TrendingUp,
      tint: 'bg-violet-50/70 dark:bg-card',
      iconBg: 'bg-violet-100 dark:bg-violet-500/20',
      iconColor: 'text-violet-600 dark:text-violet-300',
      stroke: '#8b5cf6',
      gradStops: ['#c4b5fd', '#7c3aed'],
      spark: SPARKS.wave,
      tooltip: 'Percentual de leads que fecharam contrato sobre o total.',
    },
    {
      label: 'Taxa de Eficiência',
      numValue: metrics.efficiencyRate, isPct: true,
      subtitle: 'Assinados / Avançaram do SDR',
      icon: Target,
      tint: 'bg-cyan-50/70 dark:bg-card',
      iconBg: 'bg-cyan-100 dark:bg-cyan-500/20',
      iconColor: 'text-cyan-600 dark:text-cyan-300',
      stroke: '#06b6d4',
      gradStops: ['#a5f3fc', '#0891b2'],
      spark: SPARKS.smooth,
      tooltip: 'Contratos assinados sobre leads que avançaram do SDR.',
    },
    {
      label: '% Lead Qualificado',
      numValue: metrics.qualifiedRate, isPct: true,
      subtitle: `${metrics.qualifiedCount} qualificados`,
      icon: UserCheck,
      tint: 'bg-amber-50/70 dark:bg-card',
      iconBg: 'bg-amber-100 dark:bg-amber-500/20',
      iconColor: 'text-amber-600 dark:text-amber-300',
      stroke: '#f59e0b',
      gradStops: ['#fde68a', '#d97706'],
      spark: SPARKS.steady,
      tooltip: 'Leads qualificados (Closer + Confecção + Assinatura + Assinado) sobre total.',
      clickable: true,
      auditMode: 'all' as const,
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            onClick={kpi.clickable ? () => setAuditMode(kpi.auditMode!) : undefined}
            className={`group relative overflow-hidden rounded-2xl border border-border/50 bg-card ${kpi.tint} shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${kpi.clickable ? 'cursor-pointer' : ''}`}
          >
            {/* Header: label + icon */}
            <div className="relative px-5 pt-5 pb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] md:text-xs font-semibold text-foreground/80">
                  {kpi.label}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[220px] text-xs">{kpi.tooltip}</TooltipContent>
                </Tooltip>
              </div>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${kpi.iconBg} transition-transform duration-300 group-hover:scale-110`}
              >
                <kpi.icon className={`h-[18px] w-[18px] ${kpi.iconColor}`} />
              </div>
            </div>

            {/* Value + subtitle */}
            <div className="relative px-5">
              <div
                className={`text-3xl md:text-[34px] font-bold tracking-tight tabular-nums leading-none ${
                  kpi.valueColor || 'text-foreground'
                }`}
              >
                <AnimatedCounter value={kpi.numValue} decimals={kpi.isPct ? 1 : 0} suffix={kpi.isPct ? '%' : ''} duration={1000} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{kpi.subtitle}</p>
            </div>

            {/* Sparkline — fills bottom 1/3 of card */}
            <div className="relative mt-3 h-[60px] w-full">
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 320 80"
                preserveAspectRatio="none"
                fill="none"
              >
                <defs>
                  <linearGradient id={`g-${kpi.label.replace(/\s|%/g, '')}-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={kpi.gradStops[0]} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={kpi.gradStops[1]} stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* Filled area */}
                <path
                  d={`${kpi.spark} L320,80 L0,80 Z`}
                  fill={`url(#g-${kpi.label.replace(/\s|%/g, '')}-${i})`}
                />
                {/* Smooth curve line */}
                <path
                  d={kpi.spark}
                  stroke={kpi.stroke}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                {/* Dots (subtle) */}
                {[0, 1, 2, 3, 4, 5].map(idx => {
                  // Parse last point of segments as dot positions
                  const positions = [
                    [40, 62], [110, 42], [180, 22], [220, 15], [280, 7], [320, 4]
                  ];
                  return null; // skip dots for cleaner look
                })}
              </svg>
            </div>
          </motion.div>
        ))}
      </div>

      <AuditModal
        open={!!auditMode}
        onOpenChange={(open) => {
          if (!open) setAuditMode(null);
        }}
        mode={auditMode || 'all'}
        cards={cards}
        sessions={sessions}
      />
    </>
  );
};

export default KPICards;
