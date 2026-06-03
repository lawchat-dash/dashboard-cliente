import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { getStepDisplayName } from '@/utils/normalizeStep';
import { formatPercent } from '@/utils/formatters';
import { Filter, Trophy, Users, UserCheck, Search, FileText, PenLine } from 'lucide-react';

interface CampaignFunnelProps {
  cards: Card[];
  sessions: Session[];
}

const FUNNEL_ORDER = ['SDR', 'CLOSER', 'ANALISE MANUAL', 'CONTRATO', 'ETAPA DE ASSINATURA', 'CONTRATO FECHADO'] as const;

// Mesma identidade visual do Funil de Vendas do dashboard (ícone + gradiente + glow).
const STAGE_META: Record<string, { from: string; to: string; glow: string; icon: any }> = {
  'SDR':                 { from: '#3b82f6', to: '#1d4ed8', glow: '#3b82f6', icon: Users },
  'CLOSER':              { from: '#22d3ee', to: '#0891b2', glow: '#06b6d4', icon: UserCheck },
  'ANALISE MANUAL':      { from: '#a78bfa', to: '#6d28d9', glow: '#8b5cf6', icon: Search },
  'CONTRATO':            { from: '#fb923c', to: '#ea580c', glow: '#f97316', icon: FileText },
  'ETAPA DE ASSINATURA': { from: '#34d399', to: '#15803d', glow: '#16a34a', icon: PenLine },
  'CONTRATO FECHADO':    { from: '#fbbf24', to: '#f59e0b', glow: '#f59e0b', icon: Trophy },
};

const WIDTHS = [100, 88, 76, 64, 52, 42];

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

  const { stages, campaignsByStep, total, closed } = useMemo(() => {
    const sessionCardIds = new Set(sessions.filter(s => s.utmCampaign || s.utmSource).map(s => s.cardId));
    const cardCampaigns = new Map<string, string>();
    for (const s of sessions) if (s.cardId && s.utmCampaign) cardCampaigns.set(s.cardId, s.utmCampaign);

    const relevantCards = cards.filter(c => !c.archived && sessionCardIds.has(c.id));

    const counts: Record<string, number> = {};
    const rawByStep = new Map<string, Map<string, number>>();
    for (const card of relevantCards) {
      const step = classify(card);
      if (FUNNEL_ORDER.includes(step as any)) {
        counts[step] = (counts[step] || 0) + 1;
        const campaign = cardCampaigns.get(card.id) || 'Sem campanha';
        if (!rawByStep.has(step)) rawByStep.set(step, new Map());
        const m = rawByStep.get(step)!;
        m.set(campaign, (m.get(campaign) || 0) + 1);
      }
    }
    const total = relevantCards.length;

    // CUMULATIVO: cada etapa conta quem alcançou ELA ou qualquer etapa posterior
    // (funil que decresce de verdade → conversão etapa→etapa entre 0 e 100%).
    const cum = FUNNEL_ORDER.map((_, i) => FUNNEL_ORDER.slice(i).reduce((a, s) => a + (counts[s] || 0), 0));

    // Campanhas cumulativas (união das etapas >= i) — pro tooltip bater com a barra.
    const campaignsByStep = new Map<string, Map<string, number>>();
    FUNNEL_ORDER.forEach((step, i) => {
      const merged = new Map<string, number>();
      for (let j = i; j < FUNNEL_ORDER.length; j++) {
        rawByStep.get(FUNNEL_ORDER[j])?.forEach((v, k) => merged.set(k, (merged.get(k) || 0) + v));
      }
      campaignsByStep.set(step, merged);
    });

    const stages = FUNNEL_ORDER.map((step, i) => ({
      step,
      count: cum[i],
      conv: i > 0 && cum[i - 1] > 0 ? (cum[i] / cum[i - 1]) * 100 : null,
      widthPct: WIDTHS[i],
      pctOfTotal: total > 0 ? (cum[i] / total) * 100 : 0,
      ...STAGE_META[step],
    }));

    return { stages, campaignsByStep, total, closed: counts['CONTRATO FECHADO'] || 0 };
  }, [cards, sessions, classify]);

  const hasData = stages.some(s => s.count > 0);

  const handleMouseEnter = (step: string, count: number, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const parentRect = e.currentTarget.closest('.cf-root')?.getBoundingClientRect();
    const stepCampaigns = campaignsByStep.get(step);
    const topCampaigns = stepCampaigns
      ? Array.from(stepCampaigns.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5)
      : [];
    setTooltip({
      step, count, topCampaigns,
      x: rect.left - (parentRect?.left || 0) + rect.width / 2,
      y: rect.top - (parentRect?.top || 0) - 8,
    });
  };

  return (
    <div className="cf-root relative rounded-2xl border border-border/60 bg-card p-5 md:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)] h-full flex flex-col overflow-hidden">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-base md:text-lg font-bold text-foreground tracking-tight">Funil de Conversão por Campanha</h3>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1">
            <span className="text-[11px] font-medium text-muted-foreground">Total</span>
            <span className="text-sm font-bold text-foreground tabular-nums">{total.toLocaleString('pt-BR')}</span>
          </div>
        )}
      </div>
      <p className="mb-6 text-[11px] text-muted-foreground">Jornada dos leads com dados UTM · passe o mouse para ver campanhas</p>

      {!hasData ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Sem dados de funil para a campanha selecionada</p>
      ) : (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-5">
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
                onMouseEnter={(e) => handleMouseEnter(stage.step, stage.count, e)}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* badge de conversão flutuante (não afeta o layout) */}
                {i > 0 && stage.conv !== null && (
                  <span className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border/60 bg-card px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground/80 tabular-nums shadow-sm">
                    {formatPercent(stage.conv)}
                  </span>
                )}

                {/* glow por trás (aparece no hover) */}
                <div className="absolute -inset-0.5 rounded-xl opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-25" style={{ background: `linear-gradient(135deg, ${stage.from}, ${stage.to})` }} />

                <div
                  className="relative flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-white transition-all duration-300 group-hover:-translate-y-0.5 cursor-default"
                  style={{ background: `linear-gradient(135deg, ${stage.from}, ${stage.to})`, boxShadow: `0 2px 8px -3px ${stage.glow}40` }}
                >
                  {/* brilho diagonal sutil no topo */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-xl bg-gradient-to-b from-white/12 to-transparent" />

                  <span className="relative flex items-center gap-2 font-semibold truncate min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/20">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="truncate text-xs md:text-sm">{getStepDisplayName(stage.step)}</span>
                  </span>

                  <span className="relative flex items-baseline gap-1 shrink-0 tabular-nums">
                    <span className="text-base md:text-xl font-bold drop-shadow-sm">{stage.count.toLocaleString('pt-BR')}</span>
                    <span className="text-[10px] md:text-xs font-medium opacity-80">({formatPercent(stage.pctOfTotal)})</span>
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Footer: conversão geral */}
      {hasData && (
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
            {formatPercent(total > 0 ? (closed / total) * 100 : 0)}
          </span>
          <span className="text-[11px] text-muted-foreground/60">({closed.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')})</span>
        </motion.div>
      )}

      {/* Tooltip — Top campanhas da etapa */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none rounded-lg border border-border bg-popover px-3 py-2.5 shadow-xl min-w-[200px]"
          style={{ left: Math.min(Math.max(tooltip.x, 110), 300), top: tooltip.y, transform: 'translate(-50%, -100%)' }}
        >
          <p className="text-xs font-semibold text-foreground mb-1">
            {getStepDisplayName(tooltip.step)} — {tooltip.count.toLocaleString('pt-BR')} lead{tooltip.count !== 1 ? 's' : ''}
          </p>
          {tooltip.topCampaigns.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground font-medium">Top campanhas:</p>
              {tooltip.topCampaigns.map((c) => (
                <div key={c.name} className="flex justify-between text-[10px] gap-3">
                  <span className="text-foreground truncate max-w-[160px]">{c.name}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">{c.count.toLocaleString('pt-BR')}</span>
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
