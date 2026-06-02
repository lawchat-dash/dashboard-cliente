import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Session, Card } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import AdDetailModal, { AdData } from './AdDetailModal';
import { Instagram, Facebook, Megaphone, ChevronDown, Medal, Trophy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CampaignAdRankingProps {
  sessions: Session[];
  cards: Card[];
}

type FilterMode = 'leads' | 'closed';

function platformIcon(source: string) {
  const s = source?.toUpperCase() || '';
  if (s.includes('INSTAGRAM')) return <Instagram className="h-4 w-4 text-pink-500" />;
  if (s.includes('FACEBOOK')) return <Facebook className="h-4 w-4 text-blue-500" />;
  return <Megaphone className="h-4 w-4 text-muted-foreground" />;
}

const MEDAL_COLORS = ['text-yellow-500', 'text-gray-400', 'text-amber-700'];

// Badges de pódio (1º, 2º, 3º) com gradiente
const PODIUM = [
  { grad: 'linear-gradient(135deg, #fde68a, #f59e0b)', ring: 'rgba(245,158,11,0.30)' },
  { grad: 'linear-gradient(135deg, #e2e8f0, #94a3b8)', ring: 'rgba(148,163,184,0.30)' },
  { grad: 'linear-gradient(135deg, #fdba74, #c2620c)', ring: 'rgba(194,98,12,0.30)' },
];

// Cor da barra de progresso por plataforma
function barColor(source: string) {
  const s = source?.toUpperCase() || '';
  if (s.includes('INSTAGRAM')) return 'linear-gradient(90deg, #f472b6, #db2777)';
  if (s.includes('FACEBOOK')) return 'linear-gradient(90deg, #60a5fa, #2563eb)';
  return 'linear-gradient(90deg, #8ED393, #15BF41)';
}

const CampaignAdRanking = ({ sessions, cards }: CampaignAdRankingProps) => {
  const { classify } = useClassify();
  const [mode, setMode] = useState<FilterMode>('leads');
  const [selectedAd, setSelectedAd] = useState<AdData | null>(null);
  const [showModal, setShowModal] = useState(false);

  const filteredCardIds = useMemo(() => {
    return new Set(cards.filter(c => !c.archived).map(c => c.id));
  }, [cards]);

  const cardStepMap = useMemo(() => {
    const map = new Map<string, string>();
    cards.forEach(c => {
      if (!c.archived) map.set(c.id, classify(c));
    });
    return map;
  }, [cards, classify]);

  const relevantSessions = useMemo(() => {
    return sessions.filter(s => s.cardId && filteredCardIds.has(s.cardId));
  }, [sessions, filteredCardIds]);

  const ads = useMemo(() => {
    const groups = new Map<string, {
      campaign: string;
      headline: string;
      source: string;
      sourceId: string;
      referralUrl: string | null;
      cardIds: Set<string>;
    }>();

    relevantSessions.forEach(s => {
      if (!s.utmCampaign && !s.utmSourceId) return;
      const key = `${s.utmSourceId || ''}|${s.utmCampaign || ''}`;
      if (!groups.has(key)) {
        groups.set(key, {
          campaign: s.utmCampaign || 'Sem campanha',
          headline: s.utmHeadline || '',
          source: s.utmSource || 'Desconhecido',
          sourceId: s.utmSourceId || '',
          referralUrl: s.utmReferralUrl || null,
          cardIds: new Set(),
        });
      }
      if (s.cardId) groups.get(key)!.cardIds.add(s.cardId);
    });

    return Array.from(groups.entries()).map(([key, g]) => {
      const totalLeads = g.cardIds.size;
      const totalClosed = Array.from(g.cardIds).filter(id => cardStepMap.get(id) === 'CONTRATO FECHADO').length;
      return {
        key,
        campaign: g.campaign,
        headline: g.headline,
        source: g.source,
        sourceId: g.sourceId,
        referralUrl: g.referralUrl,
        totalLeads,
        totalClosed,
        conversionRate: totalLeads > 0 ? (totalClosed / totalLeads) * 100 : 0,
      } satisfies AdData;
    });
  }, [relevantSessions, cardStepMap]);

  const sorted = useMemo(() => {
    let list = [...ads];
    if (mode === 'closed') {
      list = list.filter(a => a.totalClosed > 0);
      list.sort((a, b) => b.totalClosed - a.totalClosed || b.conversionRate - a.conversionRate);
    } else {
      list.sort((a, b) => b.totalLeads - a.totalLeads);
    }
    return list;
  }, [ads, mode]);

  const visibleAds = sorted.slice(0, 5);
  const hasMore = sorted.length > 5;
  const totalLeads = ads.reduce((sum, a) => sum + a.totalLeads, 0);
  const maxValue = Math.max(1, ...visibleAds.map(a => (mode === 'leads' ? a.totalLeads : a.totalClosed)));

  return (
    <>
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-yellow-200 dark:from-amber-500/15 dark:to-yellow-500/10 shadow-sm">
              <Trophy className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" />
            </span>
            <div>
              <h3 className="text-base font-bold text-foreground tracking-tight">Ranking de Anúncios</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{totalLeads.toLocaleString('pt-BR')} leads de anúncios</p>
            </div>
          </div>
          {hasMore && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-all hover:border-border hover:text-foreground hover:-translate-y-0.5"
            >
              Ver mais ({sorted.length})
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="mb-4 flex gap-1 rounded-lg bg-muted/50 p-1">
          <button
            onClick={() => setMode('leads')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'leads' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Leads
          </button>
          <button
            onClick={() => setMode('closed')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === 'closed' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Contrato Assinado
          </button>
        </div>

        <div className="space-y-1.5">
          {visibleAds.map((ad, i) => {
            const podium = i < 3 ? PODIUM[i] : null;
            const value = mode === 'leads' ? ad.totalLeads : ad.totalClosed;
            const barPct = Math.round((value / maxValue) * 100);
            return (
              <motion.button
                key={ad.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => setSelectedAd(ad)}
                className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${
                  i === 0 ? 'border-amber-200/60 bg-gradient-to-r from-amber-50/60 to-transparent dark:border-amber-500/20 dark:from-amber-500/[0.06]' : 'border-transparent hover:border-border/60 hover:bg-muted/30'
                }`}
              >
                {/* Posição */}
                {podium ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm" style={{ background: podium.grad, boxShadow: `0 2px 6px -1px ${podium.ring}` }}>
                    {i + 1}
                  </span>
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                )}

                {/* Plataforma */}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  {platformIcon(ad.source)}
                </span>

                {/* Texto + barra */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{ad.campaign}</p>
                  <p className="truncate text-[11px] text-muted-foreground mb-1.5">{ad.headline || 'Sem headline'}</p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: barColor(ad.source) }}
                      initial={{ width: 0 }}
                      animate={{ width: `${barPct}%` }}
                      transition={{ delay: i * 0.06 + 0.2, duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                </div>

                {/* Valor + conversão */}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-base font-bold tabular-nums text-foreground">{value}</span>
                  {mode === 'leads' && ad.conversionRate > 0 && (
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {ad.conversionRate.toFixed(1)}%
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
          {sorted.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Megaphone className="h-6 w-6 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Nenhum anúncio encontrado</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Todos os Anúncios da Campanha</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {sorted.length} anúncios — ordenados por {mode === 'leads' ? 'leads' : 'contratos'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-1">
              {sorted.map((ad, i) => (
                <button
                  key={ad.key}
                  onClick={() => { setShowModal(false); setSelectedAd(ad); }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/40"
                >
                  {i < 3 ? (
                    <Medal className={`h-5 w-5 flex-shrink-0 ${MEDAL_COLORS[i]}`} />
                  ) : (
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                  )}
                  {platformIcon(ad.source)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{ad.campaign}</p>
                      <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-primary">
                        {ad.totalLeads} leads
                      </span>
                      <span className="shrink-0 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-emerald-600">
                        {ad.totalClosed} contratos
                      </span>
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                        {ad.conversionRate.toFixed(1)}%
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{ad.headline || 'Sem headline'}</p>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AdDetailModal ad={selectedAd} onClose={() => setSelectedAd(null)} />
    </>
  );
};

export default CampaignAdRanking;
