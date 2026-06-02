import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Session, Card } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import AdDetailModal, { AdData } from './AdDetailModal';
import AnimatedCounter from '@/components/AnimatedCounter';
import {
  Instagram, Facebook, Megaphone, ChevronDown, Download, Trophy, Info,
  Users, Target, Award, TrendingUp, BarChart3, MoreVertical, Clock,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BestAdsRankingProps {
  sessions: Session[];
  cards: Card[];
}

type FilterMode = 'leads' | 'closed';

function platformInfo(source: string) {
  const s = source?.toUpperCase() || '';
  if (s.includes('INSTAGRAM')) return { icon: <Instagram className="h-3.5 w-3.5 text-pink-500" />, name: 'Instagram', dot: 'bg-pink-500' };
  if (s.includes('FACEBOOK')) return { icon: <Facebook className="h-3.5 w-3.5 text-blue-500" />, name: 'Facebook', dot: 'bg-blue-500' };
  return { icon: <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />, name: source || 'Outros', dot: 'bg-muted-foreground' };
}

const PODIUM = [
  { grad: 'linear-gradient(135deg, #fde68a, #f59e0b)', ring: 'rgba(245,158,11,0.30)' },
  { grad: 'linear-gradient(135deg, #e2e8f0, #94a3b8)', ring: 'rgba(148,163,184,0.30)' },
  { grad: 'linear-gradient(135deg, #fdba74, #c2620c)', ring: 'rgba(194,98,12,0.30)' },
];

const BestAdsRanking = ({ sessions, cards }: BestAdsRankingProps) => {
  const { classify } = useClassify();
  const [mode, setMode] = useState<FilterMode>('leads');
  const [sortKey, setSortKey] = useState<'value' | 'conversion'>('value'); // coluna de ordenação clicável
  const [selectedAd, setSelectedAd] = useState<AdData | null>(null);
  const [showModal, setShowModal] = useState(false);

  const filteredCardIds = useMemo(() => new Set(cards.filter(c => !c.archived).map(c => c.id)), [cards]);
  const cardStepMap = useMemo(() => {
    const map = new Map<string, string>();
    cards.forEach(c => { if (!c.archived) map.set(c.id, classify(c)); });
    return map;
  }, [cards, classify]);
  const relevantSessions = useMemo(() => (sessions || []).filter(s => s.cardId && filteredCardIds.has(s.cardId)), [sessions, filteredCardIds]);

  const ads = useMemo(() => {
    const groups = new Map<string, { campaign: string; headline: string; source: string; sourceId: string; referralUrl: string | null; cardIds: Set<string> }>();
    relevantSessions.forEach(s => {
      if (!s.utmCampaign && !s.utmSourceId) return;
      const key = `${s.utmSourceId || ''}|${s.utmCampaign || ''}`;
      if (!groups.has(key)) {
        groups.set(key, { campaign: s.utmCampaign || 'Sem campanha', headline: s.utmHeadline || '', source: s.utmSource || 'Desconhecido', sourceId: s.utmSourceId || '', referralUrl: s.utmReferralUrl || null, cardIds: new Set() });
      }
      if (s.cardId) groups.get(key)!.cardIds.add(s.cardId);
    });
    return Array.from(groups.entries()).map(([key, g]) => {
      const totalLeads = g.cardIds.size;
      const totalClosed = Array.from(g.cardIds).filter(id => cardStepMap.get(id) === 'CONTRATO FECHADO').length;
      return { key, campaign: g.campaign, headline: g.headline, source: g.source, sourceId: g.sourceId, referralUrl: g.referralUrl, totalLeads, totalClosed, conversionRate: totalLeads > 0 ? (totalClosed / totalLeads) * 100 : 0 } satisfies AdData;
    });
  }, [relevantSessions, cardStepMap]);

  const sorted = useMemo(() => {
    let list = [...ads];
    if (mode === 'closed') list = list.filter(a => a.totalClosed > 0);
    const val = (a: AdData) => (mode === 'closed' ? a.totalClosed : a.totalLeads);
    if (sortKey === 'conversion') {
      list.sort((a, b) => b.conversionRate - a.conversionRate || val(b) - val(a));
    } else {
      list.sort((a, b) => val(b) - val(a) || b.conversionRate - a.conversionRate);
    }
    return list;
  }, [ads, mode, sortKey]);

  // Métricas do header
  const metrics = useMemo(() => {
    const totalLeads = ads.reduce((s, a) => s + a.totalLeads, 0);
    const numAds = ads.length || 1;
    const best = ads.reduce((m, a) => Math.max(m, a.totalLeads), 0);
    const withConv = ads.filter(a => a.totalLeads > 0);
    const avgConv = withConv.length ? withConv.reduce((s, a) => s + a.conversionRate, 0) / withConv.length : 0;
    return { totalLeads, avgPerAd: totalLeads / numAds, best, avgConv };
  }, [ads]);

  const visibleAds = sorted.slice(0, 5);
  const hasMore = sorted.length > 5;
  const maxValue = Math.max(1, ...visibleAds.map(a => (mode === 'leads' ? a.totalLeads : a.totalClosed)));
  const maxConv = Math.max(1, ...visibleAds.map(a => a.conversionRate));

  const exportCSV = () => {
    const rows = [['#', 'Anuncio', 'Plataforma', 'Assunto', 'Leads', 'Contratos', 'Conversao %']];
    sorted.forEach((a, i) => rows.push([String(i + 1), a.sourceId || a.campaign, a.source, a.headline || '', String(a.totalLeads), String(a.totalClosed), a.conversionRate.toFixed(1)]));
    const csv = '﻿' + rows.map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'melhores-anuncios.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const metricCards = [
    { label: 'Total de Leads', value: metrics.totalLeads, isPct: false, sub: 'de anúncios', icon: Users, iconBg: 'bg-violet-100 dark:bg-violet-500/15', iconColor: 'text-violet-600 dark:text-violet-300', tint: 'from-violet-50/60' },
    { label: 'Média por anúncio', value: metrics.avgPerAd, isPct: false, decimals: 1, sub: 'leads', icon: Target, iconBg: 'bg-emerald-100 dark:bg-emerald-500/15', iconColor: 'text-emerald-600 dark:text-emerald-300', tint: 'from-emerald-50/60' },
    { label: 'Melhor anúncio', value: metrics.best, isPct: false, sub: 'leads', icon: Award, iconBg: 'bg-blue-100 dark:bg-blue-500/15', iconColor: 'text-blue-600 dark:text-blue-300', tint: 'from-blue-50/60' },
    { label: 'Taxa de conversão média', value: metrics.avgConv, isPct: true, sub: 'dos cliques', icon: TrendingUp, iconBg: 'bg-amber-100 dark:bg-amber-500/15', iconColor: 'text-amber-600 dark:text-amber-300', tint: 'from-amber-50/60' },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative rounded-2xl border border-border/60 bg-card p-5 md:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)] h-full flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-purple-200 dark:from-violet-500/15 dark:to-purple-500/10 shadow-sm">
              <Trophy className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </span>
            <div>
              <h3 className="flex items-center gap-1.5 text-lg font-bold text-foreground tracking-tight">
                Melhores Anúncios
                <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Ranking dos anúncios que mais geraram leads</p>
            </div>
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3.5 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-border hover:text-foreground hover:-translate-y-0.5"
          >
            <Download className="h-4 w-4" />
            Exportar
          </button>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 mb-4">
          {metricCards.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              className={`group relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br ${m.tint} to-transparent dark:from-white/[0.03] dark:to-transparent p-2.5 transition-all hover:-translate-y-0.5 hover:shadow-sm`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-medium text-muted-foreground leading-tight">{m.label}</p>
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${m.iconBg} transition-transform group-hover:scale-110`}>
                  <m.icon className={`h-3 w-3 ${m.iconColor}`} />
                </div>
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-foreground leading-tight">
                <AnimatedCounter value={m.value} decimals={(m as any).decimals || (m.isPct ? 1 : 0)} suffix={m.isPct ? '%' : ''} duration={1000} />
              </div>
              <p className="text-[10px] text-muted-foreground">{m.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Abas + filtro */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
            <button onClick={() => setMode('leads')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'leads' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <Trophy className="h-3.5 w-3.5" /> Leads
            </button>
            <button onClick={() => setMode('closed')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'closed' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <Award className="h-3.5 w-3.5" /> Contrato Assinado
            </button>
          </div>
        </div>

        {/* Tabela premium — wrapper com min-width pra header e linhas compartilharem a MESMA grid */}
        <div className="flex-1 overflow-x-auto">
          <div className="min-w-[620px]">
          {/* Header da tabela */}
          <div className="grid grid-cols-[28px_minmax(160px,1fr)_100px_110px_100px] gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 border-b border-border/50">
            <span>#</span>
            <span>Anúncio</span>
            <span>Plataforma</span>
            <button
              onClick={() => setSortKey('value')}
              className={`flex items-center gap-1 uppercase tracking-wider transition-colors ${sortKey === 'value' ? 'text-primary' : 'hover:text-foreground'}`}
              title="Ordenar por quantidade"
            >
              {mode === 'closed' ? 'Contratos' : 'Leads'}
              <ChevronDown className={`h-3 w-3 transition-opacity ${sortKey === 'value' ? 'opacity-100' : 'opacity-30'}`} />
            </button>
            <button
              onClick={() => setSortKey('conversion')}
              className={`flex items-center gap-1 uppercase tracking-wider transition-colors ${sortKey === 'conversion' ? 'text-primary' : 'hover:text-foreground'}`}
              title="Ordenar por conversão"
            >
              Conversão
              <ChevronDown className={`h-3 w-3 transition-opacity ${sortKey === 'conversion' ? 'opacity-100' : 'opacity-30'}`} />
            </button>
          </div>

          {visibleAds.map((ad, i) => {
            const podium = i < 3 ? PODIUM[i] : null;
            const value = mode === 'leads' ? ad.totalLeads : ad.totalClosed;
            const barPct = Math.round((value / maxValue) * 100);
            const convPct = Math.round((ad.conversionRate / maxConv) * 100);
            const plat = platformInfo(ad.source);
            return (
              <motion.button
                key={ad.key}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                onClick={() => setSelectedAd(ad)}
                className={`group grid grid-cols-[28px_minmax(160px,1fr)_100px_110px_100px] gap-3 items-center px-3 py-3 text-left border-b border-border/40 transition-all hover:bg-muted/30 ${
                  i === 0 ? 'bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-500/[0.05]' : ''
                }`}
              >
                {/* Posição */}
                {podium ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm" style={{ background: podium.grad, boxShadow: `0 2px 5px -1px ${podium.ring}` }}>{i + 1}</span>
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">{i + 1}</span>
                )}

                {/* Anúncio (código + assunto) */}
                <div className="min-w-0 flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/60">{plat.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{ad.sourceId || ad.campaign}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{ad.headline || 'Sem assunto'}</p>
                  </div>
                </div>

                {/* Plataforma */}
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${plat.dot}`} />
                  <span className="text-xs text-muted-foreground truncate">{plat.name}</span>
                </div>

                {/* Leads + barra roxa */}
                <div>
                  <span className="text-sm font-bold tabular-nums text-foreground">{value}</span>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-500" initial={{ width: 0 }} animate={{ width: `${barPct}%` }} transition={{ delay: i * 0.05 + 0.2, duration: 0.7, ease: 'easeOut' }} />
                  </div>
                </div>

                {/* Conversão + barra verde + tendência */}
                <div>
                  <span className="flex items-center gap-0.5 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {ad.conversionRate.toFixed(1)}%
                    {ad.conversionRate > 0 && <TrendingUp className="h-3 w-3" />}
                  </span>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-500" initial={{ width: 0 }} animate={{ width: `${convPct}%` }} transition={{ delay: i * 0.05 + 0.3, duration: 0.7, ease: 'easeOut' }} />
                  </div>
                </div>
              </motion.button>
            );
          })}

          {sorted.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Megaphone className="h-7 w-7 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum anúncio encontrado</p>
            </div>
          )}
          </div>
        </div>

        {/* Ver mais */}
        {hasMore && (
          <button
            onClick={() => setShowModal(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border/50 bg-muted/30 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
          >
            Ver mais {sorted.length - 5} anúncios
            <ChevronDown className="h-4 w-4" />
          </button>
        )}

        {/* Footer realtime */}
        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <Clock className="h-3 w-3" />
          Dados atualizados em tempo real
        </div>
      </motion.div>

      {/* Modal com todos */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Todos os Anúncios</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">{sorted.length} anúncios — ordenados por {mode === 'leads' ? 'leads' : 'contratos'}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-1">
              {sorted.map((ad, i) => {
                const plat = platformInfo(ad.source);
                return (
                  <button key={ad.key} onClick={() => { setShowModal(false); setSelectedAd(ad); }} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/40">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{i + 1}</span>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/60">{plat.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{ad.sourceId || ad.campaign}</p>
                        <span className="shrink-0 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-violet-600 dark:text-violet-400">{ad.totalLeads} leads</span>
                        <span className="shrink-0 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-emerald-600">{ad.conversionRate.toFixed(1)}%</span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{ad.headline || 'Sem assunto'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AdDetailModal ad={selectedAd} onClose={() => setSelectedAd(null)} />
    </>
  );
};

export default BestAdsRanking;
