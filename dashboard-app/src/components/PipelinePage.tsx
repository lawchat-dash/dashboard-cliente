import { useMemo, useState } from 'react';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { FUNNEL_STEPS, getStepDisplayName } from '@/utils/normalizeStep';
import { extractCampaign } from '@/utils/extractCampaign';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  User, Phone, MessageCircle, ExternalLink, Briefcase, Clock, Tag, Calendar, DollarSign,
  Users, UserCheck, Search as SearchIcon, FileText, PenLine, CheckCircle2, XCircle, Ban,
  Sparkles, TrendingUp, Target, Timer, Activity, ChevronDown,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import AnimatedCounter from '@/components/AnimatedCounter';
import { avatarPalette, initialOf, computeScore, priorityOf } from '@/utils/leadScore';

// Ícone + tom por etapa (estilo da referência)
const STAGE_META: Record<string, { icon: any; hex: string }> = {
  'SDR':                 { icon: Users,        hex: '#3b82f6' },
  'CLOSER':              { icon: UserCheck,    hex: '#06b6d4' },
  'ANALISE MANUAL':      { icon: SearchIcon,   hex: '#a855f7' },
  'CONTRATO':            { icon: FileText,     hex: '#f59e0b' },
  'ETAPA DE ASSINATURA': { icon: PenLine,      hex: '#16a34a' },
  'CONTRATO FECHADO':    { icon: CheckCircle2, hex: '#15bf41' },
  'DESQUALIFICADO':      { icon: XCircle,      hex: '#ef4444' },
  'NAO ASSINOU':         { icon: Ban,          hex: '#ec4899' },
};

interface PipelinePageProps {
  cards: Card[];
  sessions: Session[];
}

const STAGE_COLORS: Record<string, string> = {
  'SDR': 'hsl(var(--kpi-blue))',
  'CLOSER': 'hsl(var(--kpi-cyan))',
  'ANALISE MANUAL': 'hsl(var(--kpi-indigo))',
  'CONTRATO': 'hsl(var(--kpi-amber))',
  'ETAPA DE ASSINATURA': 'hsl(var(--kpi-violet))',
  'CONTRATO FECHADO': 'hsl(var(--kpi-emerald))',
  'DESQUALIFICADO': 'hsl(var(--kpi-rose))',
};

function getTimeStoppedColor(hours: number): string {
  if (hours > 48) return 'text-red-500';
  if (hours > 24) return 'text-yellow-500';
  return 'text-muted-foreground';
}

const PipelinePage = ({ cards, sessions }: PipelinePageProps) => {
  const { classify } = useClassify();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [search, setSearch] = useState('');
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());

  const sessionMap = useMemo(() => {
    const map = new Map<string, Session>();
    for (const s of sessions) {
      if (s.cardId && !map.has(s.cardId)) map.set(s.cardId, s);
    }
    return map;
  }, [sessions]);

  // Build contact tags map from sessions
  const cardContactTags = useMemo(() => {
    const cardTags = new Map<string, { id: string; name: string }[]>();
    sessions.forEach(s => {
      if (!s.cardId) return;
      const names = s.contactTagNames || [];
      if (names.length > 0 && !cardTags.has(s.cardId)) {
        cardTags.set(s.cardId, names.map((name) => ({ id: name, name })));
      }
    });
    return cardTags;
  }, [sessions]);

  const nonArchived = useMemo(() => cards.filter(c => !c.archived), [cards]);

  const columns = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (c: Card) => {
      if (!q) return true;
      const name = (c.title || sessionMap.get(c.id)?.contactName || '').toLowerCase();
      const phone = (sessionMap.get(c.id)?.contactPhone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    };
    const total = nonArchived.length;
    return FUNNEL_STEPS.map(step => {
      const stageCards = nonArchived.filter(c => classify(c) === step).filter(match);
      return {
        step,
        label: getStepDisplayName(step),
        color: STAGE_COLORS[step] || 'hsl(var(--muted-foreground))',
        meta: STAGE_META[step] || { icon: User, hex: '#94a3b8' },
        cards: stageCards,
        pct: total > 0 ? (stageCards.length / total) * 100 : 0,
      };
    });
  }, [nonArchived, classify, search, sessionMap]);

  // Métricas do header
  const metrics = useMemo(() => {
    const total = nonArchived.length;
    const closed = nonArchived.filter(c => classify(c) === 'CONTRATO FECHADO').length;
    const conv = total > 0 ? (closed / total) * 100 : 0;
    const inactive = nonArchived.filter(c => { const s = classify(c); return s === 'DESQUALIFICADO' || s === 'NAO ASSINOU'; }).length;
    const ativos = total - inactive;
    // tempo médio (dias) dos fechados
    const closedCards = nonArchived.filter(c => classify(c) === 'CONTRATO FECHADO');
    const days = closedCards.map(c => (new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime()) / 86400000).filter(d => d > 0 && d < 365);
    const avgDays = days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0;
    return { total, conv, closed, ativos, avgDays };
  }, [nonArchived, classify]);

  // Use card.title (from helena_cards) as primary name
  const getContactName = (card: Card): string =>
    card.title || sessionMap.get(card.id)?.contactName || card.contacts?.[0]?.name || '—';

  const getContactPhone = (card: Card): string =>
    sessionMap.get(card.id)?.contactPhone || '—';

  const getCampaign = (card: Card): string => {
    const session = sessionMap.get(card.id);
    return session?.utmCampaign || extractCampaign(card);
  };

  const getResponsible = (card: Card): string => {
    const session = sessionMap.get(card.id);
    return session?.agentName || card.responsibleUser?.name || '—';
  };

  const getTimeStopped = (card: Card): { text: string; hours: number } => {
    const hours = (Date.now() - new Date(card.updatedAt).getTime()) / 3600000;
    const text = formatDistanceToNow(new Date(card.updatedAt), { locale: ptBR, addSuffix: true });
    return { text, hours };
  };

  const getPreviewUrl = (cardId: string): string | null => {
    const session = sessionMap.get(cardId);
    if (!session?.sessionDetailFull) return null;
    return (session.sessionDetailFull as any)?.previewUrl || null;
  };

  const selectedPreviewUrl = selectedCard ? getPreviewUrl(selectedCard.id) : null;

  const METRIC_CARDS = [
    { label: 'Total de Leads', value: metrics.total, isPct: false, sub: '100% do total', icon: Users, tint: 'from-blue-50/60', iconBg: 'bg-blue-100 dark:bg-blue-500/15', iconColor: 'text-blue-600 dark:text-blue-300' },
    { label: 'Conversão Geral', value: metrics.conv, isPct: true, sub: `${metrics.closed} convertidos`, icon: TrendingUp, tint: 'from-emerald-50/60', iconBg: 'bg-emerald-100 dark:bg-emerald-500/15', iconColor: 'text-emerald-600 dark:text-emerald-300' },
    { label: 'Tempo Médio p/ Conversão', value: metrics.avgDays, isPct: false, decimals: 1, suffix: ' dias', sub: 'até fechar', icon: Timer, tint: 'from-amber-50/60', iconBg: 'bg-amber-100 dark:bg-amber-500/15', iconColor: 'text-amber-600 dark:text-amber-300' },
    { label: 'Leads Ativos', value: metrics.ativos, isPct: false, sub: 'em andamento', icon: Activity, tint: 'from-cyan-50/60', iconBg: 'bg-cyan-100 dark:bg-cyan-500/15', iconColor: 'text-cyan-600 dark:text-cyan-300' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-purple-200 dark:from-violet-500/15 dark:to-purple-500/10 shadow-sm">
            <Briefcase className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Pipeline</h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{nonArchived.length} leads</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Acompanhe o fluxo dos seus leads em cada etapa</p>
          </div>
        </div>
        <div className="relative w-full sm:w-80">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead, nome ou telefone..."
            className="h-10 w-full rounded-xl border border-border bg-muted/40 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all"
          />
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {METRIC_CARDS.map((m, i) => (
          <motion.div key={m.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${m.tint} to-transparent dark:from-white/[0.03] dark:to-transparent p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm`}>
            <div className="flex items-start justify-between">
              <p className="text-[11px] font-medium text-muted-foreground">{m.label}</p>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${m.iconBg} transition-transform group-hover:scale-110`}>
                <m.icon className={`h-4 w-4 ${m.iconColor}`} />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              <AnimatedCounter value={m.value} decimals={(m as any).decimals || (m.isPct ? 1 : 0)} suffix={m.isPct ? '%' : ((m as any).suffix || '')} duration={1000} />
            </div>
            <p className="text-[11px] text-muted-foreground">{m.sub}</p>
          </motion.div>
        ))}
        {/* Insight IA */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="relative overflow-hidden rounded-2xl border border-violet-200/50 bg-violet-50/40 dark:border-violet-500/15 dark:bg-violet-500/[0.06] p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/20"><Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" /></span>
            <p className="text-xs font-semibold text-foreground">Insight da IA</p>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Leads que chegam até <strong className="text-foreground">Confecção de Contrato</strong> têm <strong className="text-foreground">72% mais chance</strong> de assinatura.
          </p>
        </motion.div>
      </div>

      {/* Kanban */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: `${columns.length * 290}px` }}>
          {columns.map((col, ci) => {
            const Icon = col.meta.icon;
            const expanded = expandedCols.has(col.step);
            const visible = expanded ? col.cards : col.cards.slice(0, 6);
            return (
              <motion.div
                key={col.step}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.05 }}
                className="flex w-[280px] flex-shrink-0 flex-col rounded-2xl border border-border/60 bg-card shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
              >
                {/* Column header */}
                <div className="px-3.5 pt-3.5 pb-3 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ backgroundColor: `${col.meta.hex}1f` }}>
                      <Icon className="h-4 w-4" style={{ color: col.meta.hex }} />
                    </span>
                    <span className="text-sm font-bold text-foreground truncate">{col.label}</span>
                    <span className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums" style={{ backgroundColor: `${col.meta.hex}1f`, color: col.meta.hex }}>{col.cards.length}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">{col.pct.toFixed(1)}% do total</p>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                    <motion.div className="h-full rounded-full" style={{ background: col.meta.hex }} initial={{ width: 0 }} animate={{ width: `${col.pct}%` }} transition={{ delay: 0.2 + ci * 0.05, duration: 0.7 }} />
                  </div>
                </div>

                {/* Cards */}
                <ScrollArea className="flex-1 max-h-[calc(100vh-360px)]">
                  <div className="space-y-2 p-2.5">
                    {col.cards.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 mb-2"><Icon className="h-5 w-5 text-muted-foreground/40" /></span>
                        <p className="text-xs font-medium text-foreground">Nenhum lead nesta etapa</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Aparecerão aqui quando chegarem.</p>
                      </div>
                    )}
                    {visible.map((card, i) => {
                      const timeStopped = getTimeStopped(card);
                      const tags = cardContactTags.get(card.id) || [];
                      const name = getContactName(card);
                      const phone = getContactPhone(card);
                      const stage = classify(card);
                      const score = computeScore(stage, tags.length, phone !== '—', getCampaign(card) !== '—');
                      const prio = priorityOf(score, stage);
                      const pal = avatarPalette(name);
                      const sess = sessionMap.get(card.id);
                      const isWhats = (sess?.channelType || '').toLowerCase().includes('whats');
                      const isNew = timeStopped.hours < 6;
                      return (
                        <motion.button
                          key={card.id}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.4) }}
                          onClick={() => setSelectedCard(card)}
                          className="group/lead relative w-full overflow-hidden rounded-xl border border-border bg-background p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30"
                          style={{ borderLeftWidth: '3px', borderLeftColor: col.meta.hex }}
                        >
                          <span className={`absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full ${prio.dot}`} title={`Prioridade ${prio.label}`} />
                          <div className="flex items-center gap-2.5">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${pal.bg} ${pal.text} text-xs font-bold`}>{initialOf(name)}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                                {isNew && <span className="shrink-0 rounded bg-blue-500/15 px-1 py-0 text-[8px] font-bold text-blue-600 dark:text-blue-400">Novo</span>}
                              </div>
                              <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                                {isWhats ? <MessageCircle className="h-3 w-3 text-emerald-500 shrink-0" /> : <Phone className="h-3 w-3 text-rose-400 shrink-0" />}
                                <span className="truncate">{phone}</span>
                              </p>
                            </div>
                          </div>
                          {sess?.lastMessageText && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground/80 truncate">{sess.lastMessageText}</p>
                          )}
                          <div className="mt-2 flex items-center justify-between">
                            <span className={`flex items-center gap-1 text-[10px] ${getTimeStoppedColor(timeStopped.hours)}`}>
                              <Clock className="h-3 w-3" />{timeStopped.text}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <User className="h-3 w-3" />
                            </span>
                          </div>
                          {tags.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {tags.slice(0, 2).map(tag => (
                                <span key={tag.id} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0 text-[9px] font-medium text-primary"><Tag className="h-2 w-2" />{tag.name}</span>
                              ))}
                              {tags.length > 2 && <span className="text-[9px] text-muted-foreground self-center">+{tags.length - 2}</span>}
                            </div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </ScrollArea>

                {/* Ver todos */}
                {col.cards.length > 6 && (
                  <button
                    onClick={() => setExpandedCols(s => { const n = new Set(s); n.has(col.step) ? n.delete(col.step) : n.add(col.step); return n; })}
                    className="m-2.5 flex items-center justify-center gap-1.5 rounded-xl border border-border/50 bg-muted/30 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
                  >
                    {expanded ? 'Ver menos' : `Ver todos (${col.cards.length})`}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>


      {/* Card detail dialog — larger */}
      <Dialog open={!!selectedCard} onOpenChange={(open) => !open && setSelectedCard(null)}>
        <DialogContent className={`${selectedPreviewUrl ? 'max-w-[95vw]' : 'max-w-lg'} max-h-[92vh] p-0 gap-0 overflow-hidden`}>
          <div className="flex h-full">
            {/* Details panel */}
            <div className={`flex flex-col ${selectedPreviewUrl ? 'w-[420px] border-r border-border' : 'flex-1'}`}>
              <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4 text-primary" />
                  {selectedCard && getContactName(selectedCard)}
                </DialogTitle>
              </DialogHeader>

              {selectedCard && (
                <ScrollArea className="flex-1 max-h-[75vh]">
                  <div className="p-5 space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-foreground">{getContactPhone(selectedCard)}</span>
                      </div>

                      <div className="text-sm">
                        <span className="font-medium text-foreground">Etapa: </span>
                        <Badge
                          className="text-[10px]"
                          style={{
                            backgroundColor: `${STAGE_COLORS[classify(selectedCard)] || 'hsl(var(--muted))'}20`,
                            color: STAGE_COLORS[classify(selectedCard)] || 'hsl(var(--muted-foreground))',
                          }}
                        >
                          {getStepDisplayName(classify(selectedCard))}
                        </Badge>
                      </div>

                      <div className="text-sm">
                        <span className="font-medium text-foreground">Campanha: </span>
                        <span className="text-muted-foreground">{getCampaign(selectedCard)}</span>
                      </div>

                      <div className="text-sm">
                        <span className="font-medium text-foreground">Responsável: </span>
                        <span className="text-muted-foreground">{getResponsible(selectedCard)}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">Criado em: </span>
                        <span className="text-muted-foreground">
                          {new Date(selectedCard.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <Clock className={`h-4 w-4 ${getTimeStoppedColor(getTimeStopped(selectedCard).hours)}`} />
                        <span className="font-medium text-foreground">Na etapa: </span>
                        <span className={getTimeStoppedColor(getTimeStopped(selectedCard).hours)}>
                          {getTimeStopped(selectedCard).text}
                        </span>
                      </div>

                      {selectedCard.monetaryAmount != null && selectedCard.monetaryAmount > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-foreground">Valor: </span>
                          <span className="text-muted-foreground">
                            R$ {selectedCard.monetaryAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {/* Tags */}
                      {(cardContactTags.get(selectedCard.id) || []).length > 0 && (
                        <div className="space-y-1.5">
                          <span className="font-medium text-foreground text-sm">Tags:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {(cardContactTags.get(selectedCard.id) || []).map(tag => (
                              <span
                                key={tag.id}
                                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                              >
                                <Tag className="h-2.5 w-2.5" />
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {selectedPreviewUrl && (
                      <div className="flex items-center gap-2 pt-2">
                        <a
                          href={selectedPreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Abrir Chat
                        </a>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Chat preview */}
            {selectedPreviewUrl && (
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Preview do Chat</span>
                  </div>
                  <a href={selectedPreviewUrl} target="_blank" rel="noopener noreferrer" className="rounded-md p-1 hover:bg-muted transition-colors">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                </div>
                <iframe
                  src={selectedPreviewUrl}
                  className="flex-1 w-full min-h-[70vh] bg-background"
                  title="Chat Preview"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PipelinePage;
