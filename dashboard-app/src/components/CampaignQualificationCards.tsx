import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card as HelenaCard, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { Users, UserCheck, FileCheck, UserX } from 'lucide-react';
import AuditModal from '@/components/AuditModal';
import AnimatedCounter from '@/components/AnimatedCounter';

interface CampaignQualificationCardsProps {
  cards: HelenaCard[];
  sessions: Session[];
}

const QUALIFIED_STEPS = ['CLOSER', 'CONTRATO', 'ETAPA DE ASSINATURA', 'CONTRATO FECHADO'];

// Curvas decorativas (viewBox 320x80)
const SPARKS = {
  rising: 'M0,62 C40,58 70,46 110,40 C150,34 190,24 230,16 C260,11 290,8 320,5',
  wave:   'M0,55 C35,40 70,34 105,40 C140,46 175,56 210,50 C245,44 280,26 320,18',
  arch:   'M0,68 C40,52 80,30 130,22 C180,16 230,28 270,38 C290,42 310,46 320,50',
  down:   'M0,18 C40,22 75,30 120,38 C165,46 210,52 255,58 C280,61 300,64 320,66',
};

const CampaignQualificationCards = ({ cards, sessions }: CampaignQualificationCardsProps) => {
  const { classify } = useClassify();
  const [auditMode, setAuditMode] = useState<'all' | 'closed' | null>(null);
  const [initialStage, setInitialStage] = useState<string | undefined>(undefined);

  const metrics = useMemo(() => {
    const cardMap = new Map(cards.filter(c => !c.archived).map(c => [c.id, c]));
    const sessionsWithUtm = sessions.filter(s => s.utmCampaign || s.utmSource);
    const seenCards = new Set<string>();
    const steps: string[] = [];
    sessionsWithUtm.forEach(s => {
      if (!s.cardId || seenCards.has(s.cardId)) return;
      seenCards.add(s.cardId);
      const card = cardMap.get(s.cardId);
      if (card) steps.push(classify(card));
    });
    const total = steps.length;
    const disqualified = steps.filter(s => s === 'DESQUALIFICADO').length;
    const qualified = steps.filter(s => QUALIFIED_STEPS.includes(s)).length;
    const closed = steps.filter(s => s === 'CONTRATO FECHADO').length;
    return {
      total, disqualified, qualified, closed,
      disqualifiedPct: total > 0 ? (disqualified / total) * 100 : 0,
      qualifiedPct: total > 0 ? (qualified / total) * 100 : 0,
      closedPct: total > 0 ? (closed / total) * 100 : 0,
    };
  }, [cards, sessions, classify]);

  const handleClick = (mode: 'all' | 'closed', stage?: string) => {
    setAuditMode(mode);
    setInitialStage(stage);
  };

  const items = [
    {
      label: 'Total de Leads', numValue: metrics.total, isPct: false,
      subtitle: 'com dados UTM', icon: Users,
      stroke: '#3b82f6', fill: '#93c5fd', iconBg: 'bg-blue-100 dark:bg-blue-500/20',
      iconColor: 'text-blue-600 dark:text-blue-300', valueColor: 'text-blue-600 dark:text-blue-400',
      tint: 'from-blue-50/70', spark: SPARKS.rising, onClick: () => handleClick('all'),
    },
    {
      label: 'Qualificados', numValue: metrics.qualifiedPct, isPct: true,
      subtitle: `${metrics.qualified} leads`, icon: UserCheck,
      stroke: '#0ea5e9', fill: '#7dd3fc', iconBg: 'bg-sky-100 dark:bg-sky-500/20',
      iconColor: 'text-sky-600 dark:text-sky-300', valueColor: 'text-sky-600 dark:text-sky-400',
      tint: 'from-sky-50/70', spark: SPARKS.wave, onClick: () => handleClick('all', 'CLOSER'),
    },
    {
      label: 'Contratos Assinados', numValue: metrics.closedPct, isPct: true,
      subtitle: `${metrics.closed} leads`, icon: FileCheck,
      stroke: '#15bf41', fill: '#86efac', iconBg: 'bg-emerald-100 dark:bg-emerald-500/20',
      iconColor: 'text-emerald-600 dark:text-emerald-300', valueColor: 'text-emerald-600 dark:text-emerald-400',
      tint: 'from-emerald-50/70', spark: SPARKS.arch, highlight: true, onClick: () => handleClick('closed'),
    },
    {
      label: 'Desqualificados', numValue: metrics.disqualifiedPct, isPct: true,
      subtitle: `${metrics.disqualified} leads`, icon: UserX,
      stroke: '#ef4444', fill: '#fca5a5', iconBg: 'bg-red-100 dark:bg-red-500/20',
      iconColor: 'text-red-600 dark:text-red-300', valueColor: 'text-red-600 dark:text-red-400',
      tint: 'from-rose-50/70', spark: SPARKS.down, onClick: () => handleClick('all', 'DESQUALIFICADO'),
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-4">
        {items.map((item, i) => {
          const gid = `camp-kpi-${i}`;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              onClick={item.onClick}
              className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-gradient-to-br ${item.tint} to-transparent dark:from-white/[0.03] dark:to-transparent transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${
                item.highlight
                  ? 'border-emerald-200 dark:border-emerald-700/40 ring-1 ring-emerald-500/20 col-span-2 md:col-span-1'
                  : 'border-border/50'
              }`}
            >
              {/* Glow inferior difuso */}
              <div
                className="pointer-events-none absolute -bottom-8 left-1/2 h-16 w-[130%] -translate-x-1/2 opacity-[0.10] blur-2xl transition-opacity duration-500 group-hover:opacity-20"
                style={{ background: item.stroke }}
              />

              <div className="relative px-4 pt-4 pb-2 md:px-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] md:text-xs font-semibold text-foreground/75">{item.label}</p>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.iconBg} transition-transform duration-300 group-hover:scale-110`}>
                    <item.icon className={`h-[18px] w-[18px] ${item.iconColor}`} />
                  </div>
                </div>
                <div className={`mt-2 text-2xl md:text-[32px] font-bold leading-none tracking-tight tabular-nums ${item.valueColor}`}>
                  <AnimatedCounter value={item.numValue} decimals={item.isPct ? 1 : 0} suffix={item.isPct ? '%' : ''} />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{item.subtitle}</p>
              </div>

              {/* Sparkline */}
              <div className="relative mt-1 h-[42px] w-full">
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 80" preserveAspectRatio="none" fill="none">
                  <defs>
                    <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={item.fill} stopOpacity="0.4" />
                      <stop offset="100%" stopColor={item.fill} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={`${item.spark} L320,80 L0,80 Z`} fill={`url(#${gid})`} />
                  <motion.path
                    d={item.spark}
                    stroke={item.stroke}
                    strokeWidth={2}
                    strokeLinecap="round"
                    fill="none"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: i * 0.07 + 0.3, duration: 0.9, ease: 'easeInOut' }}
                  />
                </svg>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AuditModal
        open={!!auditMode}
        onOpenChange={(open) => { if (!open) { setAuditMode(null); setInitialStage(undefined); } }}
        mode={auditMode || 'all'}
        cards={cards}
        sessions={sessions}
        initialStage={initialStage}
      />
    </>
  );
};

export default CampaignQualificationCards;
