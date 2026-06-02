import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { getStepDisplayName } from '@/utils/normalizeStep';
import { GitBranch, ChevronDown, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MultiTouchAttributionProps {
  cards: Card[];
  sessions: Session[];
}

interface LeadJourney {
  leadName: string;
  cardKey: string;
  currentStep: string;
  touchpoints: {
    campaign: string;
    source: string;
    date: string;
    timestamp: number;
  }[];
  isConverted: boolean;
}

const STEP_COLORS: Record<string, string> = {
  'SDR': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'CLOSER': 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  'CONTRATO': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  'ETAPA DE ASSINATURA': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  'CONTRATO FECHADO': 'bg-green-500/10 text-green-600 border-green-500/20',
  'DESQUALIFICADO': 'bg-red-500/10 text-red-500 border-red-500/20',
};

const MultiTouchAttribution = ({ cards, sessions }: MultiTouchAttributionProps) => {
  const { classify } = useClassify();
  const navigate = useNavigate();
  const [selectedJourney, setSelectedJourney] = useState<LeadJourney | null>(null);
  const [showAll, setShowAll] = useState(false);

  const journeys = useMemo(() => {
    const cardMap = new Map(cards.filter(c => !c.archived).map(c => [c.id, c]));

    // Group sessions by cardId
    const cardSessions = new Map<string, Session[]>();
    for (const s of sessions) {
      if (!s.cardId || !s.utmCampaign) continue;
      const arr = cardSessions.get(s.cardId) || [];
      arr.push(s);
      cardSessions.set(s.cardId, arr);
    }

    // Only leads with 2+ touchpoints (multi-touch)
    const result: LeadJourney[] = [];
    for (const [cardId, cardSessionList] of cardSessions) {
      // Deduplicate by campaign
      const uniqueCampaigns = new Map<string, Session>();
      for (const s of cardSessionList) {
        const key = s.utmCampaign || '';
        if (!uniqueCampaigns.has(key) || 
            (s.sessionCreatedAt && (!uniqueCampaigns.get(key)!.sessionCreatedAt || 
             s.sessionCreatedAt < uniqueCampaigns.get(key)!.sessionCreatedAt!))) {
          uniqueCampaigns.set(key, s);
        }
      }

      if (uniqueCampaigns.size < 2) continue;

      const card = cardMap.get(cardId);
      if (!card) continue;

      const step = classify(card);
      const touchpoints = Array.from(uniqueCampaigns.values())
        .filter(s => s.sessionCreatedAt)
        .map(s => ({
          campaign: s.utmCampaign || '—',
          source: s.utmSource || '—',
          date: new Date(s.sessionCreatedAt!).toLocaleDateString('pt-BR'),
          timestamp: new Date(s.sessionCreatedAt!).getTime(),
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      if (touchpoints.length < 2) continue;

      result.push({
        leadName: card.contacts?.[0]?.name || card.title || '—',
        cardKey: card.key,
        currentStep: step,
        touchpoints,
        isConverted: step === 'CONTRATO FECHADO',
      });
    }

    return result.sort((a, b) => {
      if (a.isConverted !== b.isConverted) return a.isConverted ? -1 : 1;
      return b.touchpoints.length - a.touchpoints.length;
    });
  }, [cards, sessions]);

  // Campaign attribution stats
  const attributionStats = useMemo(() => {
    const stats = new Map<string, { firstTouch: number; lastTouch: number; assisted: number }>();

    for (const j of journeys) {
      const tps = j.touchpoints;
      if (tps.length === 0) continue;

      // First touch
      const first = tps[0].campaign;
      const entry1 = stats.get(first) || { firstTouch: 0, lastTouch: 0, assisted: 0 };
      entry1.firstTouch++;
      stats.set(first, entry1);

      // Last touch
      const last = tps[tps.length - 1].campaign;
      const entry2 = stats.get(last) || { firstTouch: 0, lastTouch: 0, assisted: 0 };
      entry2.lastTouch++;
      stats.set(last, entry2);

      // Assisted (middle touches)
      for (let i = 1; i < tps.length - 1; i++) {
        const mid = tps[i].campaign;
        const entry3 = stats.get(mid) || { firstTouch: 0, lastTouch: 0, assisted: 0 };
        entry3.assisted++;
        stats.set(mid, entry3);
      }
    }

    return Array.from(stats.entries())
      .map(([campaign, s]) => ({ campaign, ...s, total: s.firstTouch + s.lastTouch + s.assisted }))
      .sort((a, b) => b.total - a.total);
  }, [journeys]);

  const visibleJourneys = journeys.slice(0, 5);
  const hasMore = journeys.length > 5;

  if (journeys.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="mb-1 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Atribuição Multi-Toque</h3>
        </div>
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum lead com múltiplas campanhas encontrado
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="mb-1 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Atribuição Multi-Toque</h3>
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          {journeys.length} leads com jornada em múltiplas campanhas
        </p>

        {/* Explanation block */}
        <div className="mb-4 rounded-lg bg-muted/40 border border-border/50 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Mostra leads que interagiram com <strong className="text-foreground">2 ou mais campanhas</strong> antes de converter.{' '}
            O <strong className="text-blue-500">1º Toque</strong> indica qual campanha atraiu o lead pela primeira vez.{' '}
            A <strong className="text-foreground">Assistência</strong> mostra campanhas intermediárias que mantiveram o interesse.{' '}
            O <strong className="text-emerald-500">Último Toque</strong> revela qual campanha fechou a conversão.
          </p>
        </div>

        {/* Attribution summary table */}
        {attributionStats.length > 0 && (
          <div className="mb-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Campanha</th>
                  <th className="px-3 py-2 text-right font-medium" title="Campanha que atraiu o lead pela primeira vez">1º Toque ℹ️</th>
                  <th className="px-3 py-2 text-right font-medium" title="Campanhas intermediárias que mantiveram o interesse do lead">Assistência ℹ️</th>
                  <th className="px-3 py-2 text-right font-medium" title="Última campanha antes da conversão do lead">Último Toque ℹ️</th>
                </tr>
              </thead>
              <tbody>
                {attributionStats.slice(0, 5).map((s) => (
                  <tr key={s.campaign} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground truncate max-w-[180px]">{s.campaign}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-500 font-medium">{s.firstTouch}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.assisted}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-500 font-medium">{s.lastTouch}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Journey list */}
        <div className="space-y-2">
          {visibleJourneys.map((j, i) => (
            <motion.button
              key={j.cardKey}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelectedJourney(j)}
              className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-emerald-500/10 hover:border-emerald-500/30"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{j.leadName}</p>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STEP_COLORS[j.currentStep] || 'bg-muted text-muted-foreground'}`}>
                    {getStepDisplayName(j.currentStep)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {j.touchpoints.length} campanhas · {j.touchpoints.map(t => t.campaign).join(' → ')}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary tabular-nums">
                {j.touchpoints.length} toques
              </span>
            </motion.button>
          ))}
        </div>

        {hasMore && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-primary transition-colors hover:bg-muted/40"
          >
            Ver mais ({journeys.length - 5})
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Modal ver mais */}
      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Todos os Leads Multi-Toque</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {journeys.length} leads com jornada em múltiplas campanhas
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-2">
              {journeys.map((j, i) => (
                <button
                  key={j.cardKey}
                  onClick={() => { setShowAll(false); setSelectedJourney(j); }}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-emerald-500/10 hover:border-emerald-500/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{j.leadName}</p>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STEP_COLORS[j.currentStep] || 'bg-muted text-muted-foreground'}`}>
                        {getStepDisplayName(j.currentStep)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {j.touchpoints.map(t => t.campaign).join(' → ')}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-primary tabular-nums">{j.touchpoints.length} toques</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Detail modal */}
      <Dialog open={!!selectedJourney} onOpenChange={() => setSelectedJourney(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Jornada do Lead</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {selectedJourney?.leadName} · {selectedJourney?.cardKey}
            </DialogDescription>
          </DialogHeader>
          {selectedJourney && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Etapa atual:</span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STEP_COLORS[selectedJourney.currentStep] || 'bg-muted text-muted-foreground'}`}>
                  {getStepDisplayName(selectedJourney.currentStep)}
                </span>
              </div>

              {/* Timeline */}
              <div className="relative pl-6 space-y-4">
                <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
                {selectedJourney.touchpoints.map((tp, i) => (
                  <div key={i} className="relative">
                    <div className={`absolute -left-4 top-1 h-3 w-3 rounded-full border-2 ${
                      i === 0 ? 'bg-blue-500 border-blue-500' :
                      i === selectedJourney.touchpoints.length - 1 ? 'bg-emerald-500 border-emerald-500' :
                      'bg-muted border-muted-foreground'
                    }`} />
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {i === 0 ? '1º Toque' : i === selectedJourney.touchpoints.length - 1 ? 'Último Toque' : `${i + 1}º Toque`}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{tp.date}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedJourney(null);
                          navigate(`/campanhas`);
                        }}
                        className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        title="Ver campanha"
                      >
                        {tp.campaign}
                        <ExternalLink className="h-3 w-3" />
                      </button>
                      <p className="text-[11px] text-muted-foreground">via {tp.source}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MultiTouchAttribution;
