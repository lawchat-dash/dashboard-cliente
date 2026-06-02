import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Session } from '@/api/helena';
import { classifyStep } from '@/utils/normalizeStep';
import { formatPercent } from '@/utils/formatters';
import { FlaskConical, Trophy, AlertTriangle, Minus } from 'lucide-react';
import AdDetailModal, { AdData } from '@/components/AdDetailModal';

interface ABTestProps {
  cards: Card[];
  sessions: Session[];
}

interface AdCreative {
  sourceId: string;
  campaign: string;
  headline: string;
  source: string;
  referralUrl: string | null;
  leads: number;
  conversions: number;
  disqualified: number;
  naoAssinou: number;
  conversionRate: number;
  disqualificationRate: number;
}

interface ABComparison {
  campaign: string;
  creatives: AdCreative[];
  winner: AdCreative | null;
  loser: AdCreative | null;
  recommendation: string;
}

const ABTestAutomatico = ({ cards, sessions }: ABTestProps) => {
  const [selectedAd, setSelectedAd] = useState<AdData | null>(null);

  const comparisons = useMemo(() => {
    const cardMap = new Map(cards.filter(c => !c.archived).map(c => [c.id, c]));

    const campaignCreatives = new Map<string, Map<string, {
      sourceId: string;
      headline: string;
      source: string;
      referralUrl: string | null;
      cardIds: Set<string>;
    }>>();

    for (const s of sessions) {
      if (!s.utmCampaign || !s.utmSourceId) continue;
      if (!campaignCreatives.has(s.utmCampaign)) {
        campaignCreatives.set(s.utmCampaign, new Map());
      }
      const creatives = campaignCreatives.get(s.utmCampaign)!;
      if (!creatives.has(s.utmSourceId)) {
        creatives.set(s.utmSourceId, {
          sourceId: s.utmSourceId,
          headline: s.utmHeadline || 'Sem headline',
          source: s.utmSource || '—',
          referralUrl: s.utmReferralUrl || null,
          cardIds: new Set(),
        });
      } else if (!creatives.get(s.utmSourceId)!.referralUrl && s.utmReferralUrl) {
        creatives.get(s.utmSourceId)!.referralUrl = s.utmReferralUrl;
      }
      if (s.cardId) creatives.get(s.utmSourceId)!.cardIds.add(s.cardId);
    }

    const results: ABComparison[] = [];

    for (const [campaign, creatives] of campaignCreatives) {
      if (creatives.size < 2) continue;

      const adCreatives: AdCreative[] = Array.from(creatives.values()).map(c => {
        const leads = c.cardIds.size;
        let conversions = 0;
        let disqualified = 0;
        let naoAssinou = 0;
        for (const cardId of c.cardIds) {
          const card = cardMap.get(cardId);
          if (!card) continue;
          const step = classifyStep(card.stepTitle);
          if (step === 'CONTRATO FECHADO') conversions++;
          if (step === 'DESQUALIFICADO') disqualified++;
          if (step === 'NAO ASSINOU') naoAssinou++;
        }
        return {
          sourceId: c.sourceId,
          campaign,
          headline: c.headline,
          source: c.source,
          referralUrl: c.referralUrl,
          leads,
          conversions,
          disqualified,
          naoAssinou,
          conversionRate: leads > 0 ? (conversions / leads) * 100 : 0,
          disqualificationRate: leads > 0 ? (disqualified / leads) * 100 : 0,
        };
      }).filter(c => c.leads >= 3);

      if (adCreatives.length < 2) continue;

      adCreatives.sort((a, b) => b.conversionRate - a.conversionRate || b.leads - a.leads);

      const winner = adCreatives[0];
      const loser = adCreatives[adCreatives.length - 1];

      let recommendation = '';
      if (loser.conversionRate === 0 && loser.leads >= 5) {
        recommendation = `Considere pausar "${loser.headline.substring(0, 40)}…" — ${loser.leads} leads sem conversão`;
      } else if (winner.conversionRate > loser.conversionRate * 2 && loser.leads >= 3) {
        recommendation = `O melhor criativo converte ${(winner.conversionRate / Math.max(loser.conversionRate, 0.1)).toFixed(1)}x mais que o pior`;
      } else if (loser.disqualificationRate > 50) {
        recommendation = `Criativo com ${formatPercent(loser.disqualificationRate)} de desqualificação — revisar segmentação`;
      } else {
        recommendation = `Desempenho similar entre criativos — manter ambos ativos`;
      }

      results.push({ campaign, creatives: adCreatives, winner: winner.conversionRate > 0 ? winner : null, loser, recommendation });
    }

    return results.sort((a, b) => {
      const aSpread = a.winner ? a.winner.conversionRate - a.loser!.conversionRate : 0;
      const bSpread = b.winner ? b.winner.conversionRate - b.loser!.conversionRate : 0;
      return bSpread - aSpread;
    });
  }, [cards, sessions]);

  const handleCreativeClick = (c: AdCreative) => {
    setSelectedAd({
      key: c.sourceId,
      campaign: c.campaign,
      headline: c.headline,
      source: c.source,
      sourceId: c.sourceId,
      referralUrl: c.referralUrl,
      totalLeads: c.leads,
      totalClosed: c.conversions,
      conversionRate: c.conversionRate,
    });
  };

  if (comparisons.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="mb-1 flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">A/B Test Automático</h3>
        </div>
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma campanha com múltiplos criativos encontrada (mínimo 3 leads por criativo)
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="mb-1 flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">A/B Test Automático</h3>
        </div>
        <p className="mb-4 text-[11px] text-muted-foreground">
          Comparação de criativos em {comparisons.length} campanha{comparisons.length > 1 ? 's' : ''} · Clique em um criativo para ver detalhes
        </p>

        <div className="space-y-5">
          {comparisons.slice(0, 5).map((comp, ci) => (
            <motion.div
              key={comp.campaign}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: ci * 0.05 }}
            >
              <p className="text-xs font-bold text-foreground mb-2 uppercase tracking-wide truncate" title={comp.campaign}>
                {comp.campaign}
              </p>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_60px_56px_56px_56px_64px] gap-0 bg-muted/60 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>Criativo</span>
                  <span className="text-center">Leads</span>
                  <span className="text-center">Conv.</span>
                  <span className="text-center">Desq.</span>
                  <span className="text-center">N/Ass.</span>
                  <span className="text-center">Taxa</span>
                </div>

                {comp.creatives.slice(0, 4).map((c) => {
                  const isWinner = comp.winner?.sourceId === c.sourceId;
                  const isLoser = comp.loser?.sourceId === c.sourceId && comp.creatives.length > 1 && c.conversionRate === 0;

                  return (
                    <div
                      key={c.sourceId}
                      onClick={() => handleCreativeClick(c)}
                      className={`grid grid-cols-[1fr_60px_56px_56px_56px_64px] gap-0 items-center px-3 py-2 border-t border-border/50 transition-colors cursor-pointer hover:bg-primary/5 ${
                        isWinner ? 'bg-emerald-500/5' : isLoser ? 'bg-red-500/5' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isWinner ? (
                          <Trophy className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : isLoser ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        ) : (
                          <Minus className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs text-foreground truncate leading-tight" title={c.headline}>{c.headline}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">{c.source}</p>
                        </div>
                      </div>
                      <span className="text-xs text-center tabular-nums font-medium text-foreground">{c.leads}</span>
                      <span className="text-xs text-center tabular-nums font-medium text-emerald-600">{c.conversions}</span>
                      <span className="text-xs text-center tabular-nums font-medium text-red-500">{c.disqualified}</span>
                      <span className="text-xs text-center tabular-nums font-medium text-amber-500">{c.naoAssinou}</span>
                      <span className={`text-xs text-center tabular-nums font-bold ${
                        c.conversionRate > 0 ? 'text-emerald-600' : 'text-muted-foreground'
                      }`}>
                        {formatPercent(c.conversionRate)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-1.5">
                <p className="text-[11px] text-foreground leading-relaxed">💡 {comp.recommendation}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AdDetailModal ad={selectedAd} onClose={() => setSelectedAd(null)} />
    </>
  );
};

export default ABTestAutomatico;
