import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { FUNNEL_STEPS, getStepDisplayName } from '@/utils/normalizeStep';
import { extractCampaign } from '@/utils/extractCampaign';
import { ExternalLink, Phone, User, ChevronDown, ChevronUp, MessageCircle, X, ClipboardCheck, Tag, ArrowLeft, RefreshCw, Search, Clock, Bot, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { syncCardSessions } from '@/lib/helenaSessionSync';
import { toast } from 'sonner';

const STAGE_COLORS: Record<string, string> = {
  'SDR': 'hsl(var(--kpi-blue))',
  'CLOSER': 'hsl(var(--kpi-cyan))',
  'ANALISE MANUAL': 'hsl(var(--kpi-indigo))',
  'CONTRATO': 'hsl(var(--kpi-amber))',
  'ETAPA DE ASSINATURA': 'hsl(var(--kpi-violet))',
  'CONTRATO FECHADO': 'hsl(var(--kpi-emerald))',
  'DESQUALIFICADO': 'hsl(var(--kpi-rose))',
};

const STAGE_EMOJIS: Record<string, string> = {
  'SDR': '📞', 'CLOSER': '🤝', 'ANALISE MANUAL': '🕵️', 'CONTRATO': '📝',
  'ETAPA DE ASSINATURA': '✍️', 'CONTRATO FECHADO': '🏆', 'DESQUALIFICADO': '❌',
};

// Peso de avanço no funil → base do score de qualificação
const STAGE_WEIGHT: Record<string, number> = {
  'SDR': 35, 'CLOSER': 60, 'ANALISE MANUAL': 55, 'CONTRATO': 80,
  'ETAPA DE ASSINATURA': 90, 'CONTRATO FECHADO': 100, 'DESQUALIFICADO': 10,
};

// Cores de avatar por inicial (determinístico)
const AVATAR_PALETTES = [
  { bg: 'bg-blue-100 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-300' },
  { bg: 'bg-violet-100 dark:bg-violet-500/20', text: 'text-violet-600 dark:text-violet-300' },
  { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-300' },
  { bg: 'bg-pink-100 dark:bg-pink-500/20', text: 'text-pink-600 dark:text-pink-300' },
  { bg: 'bg-cyan-100 dark:bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-300' },
];
function avatarPalette(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}
function initialOf(name: string) {
  const clean = (name || '').replace(/[^\p{L}\p{N} ]/gu, '').trim();
  return (clean[0] || '?').toUpperCase();
}

// Score 0-100 de qualificação (heurística sobre dados reais)
function computeScore(stage: string, tagCount: number, hasPhone: boolean, hasCampaign: boolean): number {
  let score = STAGE_WEIGHT[stage] ?? 30;
  score += Math.min(tagCount * 4, 12);     // tags = mais contexto
  if (hasPhone) score += 4;
  if (hasCampaign) score += 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}
function priorityOf(score: number, stage: string): { label: string; color: string; dot: string } {
  if (stage === 'DESQUALIFICADO') return { label: 'Baixa', color: 'text-muted-foreground', dot: 'bg-muted-foreground/40' };
  if (score >= 75) return { label: 'Alta', color: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' };
  if (score >= 50) return { label: 'Média', color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' };
  return { label: 'Baixa', color: 'text-muted-foreground', dot: 'bg-muted-foreground/40' };
}
function scoreColor(score: number): { bg: string; text: string } {
  if (score >= 75) return { bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400' };
  if (score >= 50) return { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-700 dark:text-amber-400' };
  return { bg: 'bg-slate-100 dark:bg-slate-500/15', text: 'text-slate-600 dark:text-slate-400' };
}

interface AuditPageProps {
  cards: Card[];
  sessions: Session[];
}

const AuditPage = ({ cards, sessions }: AuditPageProps) => {
  const { classify } = useClassify();
  const isMobile = useIsMobile();
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'stages' | 'leads' | 'preview'>('stages');
  const [syncedOverrides, setSyncedOverrides] = useState<Map<string, Session>>(new Map());
  const [syncingCardId, setSyncingCardId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'recent' | 'tagged' | 'ia_off' | 'no_grace'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchInputRef.current?.focus(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const sessionMap = useMemo(() => {
    const map = new Map<string, Session>();
    for (const s of sessions) {
      if (s.cardId && !map.has(s.cardId)) map.set(s.cardId, s);
    }
    for (const [cid, s] of syncedOverrides) map.set(cid, s);
    return map;
  }, [sessions, syncedOverrides]);

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

  const filteredCards = useMemo(() => {
    let list = cards.filter(c => !c.archived);
    const q = search.trim().toLowerCase();
    // Com busca → atravessa TODAS as etapas; sem busca → respeita a etapa selecionada
    if (activeStage && !q) list = list.filter(c => classify(c) === activeStage);

    if (quickFilter === 'recent') {
      const cutoff = Date.now() - 24 * 3600 * 1000;
      list = list.filter(c => new Date(c.createdAt).getTime() >= cutoff);
    } else if (quickFilter === 'tagged') {
      list = list.filter(c => (cardContactTags.get(c.id) || []).length > 0);
    } else if (quickFilter === 'ia_off') {
      list = list.filter(c => (cardContactTags.get(c.id) || []).some(t => /ia desativ/i.test(t.name)));
    } else if (quickFilter === 'no_grace') {
      list = list.filter(c => (cardContactTags.get(c.id) || []).some(t => /per[ií]odo de gra[çc]a/i.test(t.name)));
    }

    if (q) {
      list = list.filter(c => {
        const name = (c.title || sessionMap.get(c.id)?.contactName || '').toLowerCase();
        const phone = (sessionMap.get(c.id)?.contactPhone || '').toLowerCase();
        const tagText = (cardContactTags.get(c.id) || []).map(t => t.name).join(' ').toLowerCase();
        const stageText = getStepDisplayName(classify(c)).toLowerCase();
        return name.includes(q) || phone.includes(q) || tagText.includes(q) || stageText.includes(q);
      });
    }
    return list;
  }, [cards, activeStage, classify, quickFilter, search, cardContactTags, sessionMap]);

  const getPreviewUrl = (cardId: string): string | null => {
    const session = sessionMap.get(cardId);
    if (!session?.sessionDetailFull) return null;
    return (session.sessionDetailFull as any)?.previewUrl || null;
  };

  const handleSyncCard = async (cardId: string) => {
    setSyncingCardId(cardId);
    try {
      const result = await syncCardSessions(cardId);
      if (result.sessions && result.sessions.length > 0) {
        setSyncedOverrides(prev => {
          const next = new Map(prev);
          next.set(cardId, result.sessions[0]);
          return next;
        });
        const newPreview = (result.sessions[0].sessionDetailFull as any)?.previewUrl;
        if (newPreview) {
          toast.success('Chat sincronizado!');
          setPreviewCardId(cardId);
        } else {
          toast.warning('Sessão sincronizada, mas sem preview disponível.');
        }
      } else {
        toast.warning('Nenhuma sessão encontrada para este lead.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao sincronizar.');
    } finally {
      setSyncingCardId(null);
    }
  };

  const getContactPhone = (card: Card): string => sessionMap.get(card.id)?.contactPhone || '—';
  const getContactName = (card: Card): string => card.title || sessionMap.get(card.id)?.contactName || card.contacts?.[0]?.name || '—';

  const activePreviewUrl = previewCardId ? getPreviewUrl(previewCardId) : null;
  const hasPreview = !!activePreviewUrl;
  const previewCard = previewCardId ? cards.find(c => c.id === previewCardId) : null;

  const handleStageSelect = (stage: string | null) => {
    setActiveStage(stage);
    setExpandedCardId(null);
    if (isMobile) setMobileView('leads');
  };

  const handlePreviewOpen = (cardId: string) => {
    setPreviewCardId(cardId);
    if (isMobile) setMobileView('preview');
  };

  // MOBILE LAYOUT — full-screen panels with navigation
  if (isMobile) {
    // Mobile: Preview panel
    if (mobileView === 'preview' && activePreviewUrl) {
      return (
        <div className="flex flex-col h-[calc(100vh-120px)] rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/30">
            <button onClick={() => setMobileView('leads')} className="flex items-center gap-1 text-sm text-primary">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <div className="flex-1 min-w-0 mx-3 text-center">
              <span className="text-sm font-medium truncate block">{previewCard ? getContactName(previewCard) : 'Chat'}</span>
            </div>
            <a href={activePreviewUrl} target="_blank" rel="noopener noreferrer" className="p-1">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          </div>
          <iframe key={previewCardId} src={activePreviewUrl} className="flex-1 w-full bg-background" title="Chat Preview" />
        </div>
      );
    }

    // Mobile: Leads list
    if (mobileView === 'leads') {
      return (
        <div className="flex flex-col h-[calc(100vh-120px)] rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-border">
            <button onClick={() => setMobileView('stages')} className="flex items-center gap-1 text-sm text-primary mb-2">
              <ArrowLeft className="h-4 w-4" /> Etapas
            </button>
            <h2 className="text-base font-semibold text-foreground">
              {activeStage ? getStepDisplayName(activeStage) : 'Todos os Leads'}
            </h2>
            <p className="text-xs text-muted-foreground">{filteredCards.length} leads</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y divide-border/50">
              {filteredCards.length === 0 && (
                <div className="px-4 py-10 text-center text-muted-foreground text-sm">Nenhum lead encontrado</div>
              )}
              {filteredCards.map((card) => {
                const isExpanded = expandedCardId === card.id;
                const previewUrl = getPreviewUrl(card.id);
                const campaign = extractCampaign(card);
                const tags = cardContactTags.get(card.id) || [];

                return (
                  <div key={card.id}>
                    <button
                      onClick={() => setExpandedCardId(isExpanded ? null : card.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                    >
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{getContactName(card)}</p>
                        <p className="text-xs text-muted-foreground truncate">{campaign}</p>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="px-4 pb-3 pl-11 space-y-2">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="h-3.5 w-3.5" /><span>{getContactPhone(card)}</span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">Etapa:</span> {getStepDisplayName(classify(card))}
                            </div>
                            {tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {tags.map(tag => (
                                  <span key={tag.id} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                    <Tag className="h-2.5 w-2.5" />{tag.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {previewUrl && (
                              <button
                                onClick={() => handlePreviewOpen(card.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
                              >
                                <MessageCircle className="h-4 w-4" /> Preview Chat
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      );
    }

    // Mobile: Stage selector (default)
    return (
      <div className="flex flex-col rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <span className="text-base font-bold text-foreground">Auditoria</span>
        </div>
        <div className="flex flex-col gap-1 p-3">
          <button
            onClick={() => handleStageSelect(null)}
            className="flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-all bg-background shadow-sm border border-border"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-base shrink-0">📋</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Todos</p>
              <p className="text-xs text-muted-foreground">{cards.filter(c => !c.archived).length} leads</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground rotate-[-90deg]" />
          </button>
          {(FUNNEL_STEPS as unknown as string[]).map((step) => {
            const color = STAGE_COLORS[step] || 'hsl(var(--kpi-blue))';
            const count = cards.filter(c => !c.archived && classify(c) === step).length;
            return (
              <button
                key={step}
                onClick={() => handleStageSelect(step)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-all hover:bg-background/50"
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-base shrink-0"
                  style={{ backgroundColor: `${color}33`, color }}
                >
                  {STAGE_EMOJIS[step] || '📋'}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{getStepDisplayName(step)}</p>
                  <p className="text-xs text-muted-foreground">{count} leads</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground rotate-[-90deg]" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // DESKTOP LAYOUT — original 3-column
  return (
    <div className="flex h-[calc(100vh-140px)] rounded-xl border border-border bg-card shadow-card overflow-hidden">
      {/* Stage sidebar */}
      <div className="flex flex-col gap-1 border-r border-border px-3 py-5 bg-muted/30 min-w-[170px] max-w-[200px]">
        <div className="flex items-center gap-2 mb-3 px-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold text-foreground">Auditoria</span>
        </div>
        <button
          onClick={() => { setActiveStage(null); setExpandedCardId(null); }}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-all ${
            !activeStage ? 'bg-background shadow-sm border border-border' : 'hover:bg-background/50'
          }`}
        >
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm shrink-0 ${!activeStage ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>📋</div>
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-medium truncate ${!activeStage ? 'text-foreground' : 'text-muted-foreground'}`}>Todos</p>
            <p className="text-[10px] text-muted-foreground">{cards.filter(c => !c.archived).length} leads</p>
          </div>
        </button>
        {(FUNNEL_STEPS as unknown as string[]).map((step) => {
          const color = STAGE_COLORS[step] || 'hsl(var(--kpi-blue))';
          const isActive = step === activeStage;
          const count = cards.filter(c => !c.archived && classify(c) === step).length;
          return (
            <button
              key={step}
              onClick={() => { setActiveStage(step); setExpandedCardId(null); }}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-all ${
                isActive ? 'bg-background shadow-sm border border-border' : 'hover:bg-background/50'
              }`}
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm shrink-0 ${isActive ? 'ring-2 ring-offset-1' : ''}`}
                style={{ backgroundColor: isActive ? color : `${color}33`, color: isActive ? 'white' : color, ringColor: isActive ? color : undefined } as any}
              >
                {STAGE_EMOJIS[step] || '📋'}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] font-medium truncate ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{getStepDisplayName(step)}</p>
                <p className="text-[10px] text-muted-foreground">{count} leads</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Lead list */}
      <div className={`flex-1 flex flex-col min-w-0 ${hasPreview ? 'max-w-[400px]' : ''} border-r border-border`}>
        <div className="px-5 pt-4 pb-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-foreground">
                {activeStage ? getStepDisplayName(activeStage) : 'Todos os Leads'}
              </h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{filteredCards.length} leads</span>
            </div>
            <div className="relative hidden sm:block w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome, telefone, tag..."
                className="h-9 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-12 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all"
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">⌘K</kbd>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            {([
              { key: 'all', label: 'Todos', icon: ClipboardCheck },
              { key: 'recent', label: 'Recentes', icon: Clock },
              { key: 'tagged', label: 'Com tags', icon: Tag },
              { key: 'ia_off', label: 'IA desativada', icon: Bot },
              { key: 'no_grace', label: 'Sem período de graça', icon: ShieldAlert },
            ] as const).map(f => {
              const active = quickFilter === f.key;
              return (
                <button key={f.key} onClick={() => setQuickFilter(f.key)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${active ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}>
                  <f.icon className="h-3.5 w-3.5" />{f.label}
                </button>
              );
            })}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="divide-y divide-border/50">
            {filteredCards.length === 0 && (
              <div className="px-5 py-10 text-center text-muted-foreground text-sm">Nenhum lead encontrado</div>
            )}
            {filteredCards.map((card, ci) => {
              const isExpanded = expandedCardId === card.id;
              const previewUrl = getPreviewUrl(card.id);
              const campaign = extractCampaign(card);
              const isPreviewActive = previewCardId === card.id;
              const tags = cardContactTags.get(card.id) || [];

              // Derivados premium
              const stage = classify(card);
              const name = getContactName(card);
              const phone = getContactPhone(card);
              const score = computeScore(stage, tags.length, phone !== '—', !!campaign && campaign !== '—');
              const prio = priorityOf(score, stage);
              const sc = scoreColor(score);
              const pal = avatarPalette(name);
              const isSyncing = syncingCardId === card.id;

              return (
                <motion.div
                  key={card.id}
                  initial={ci < 20 ? { opacity: 0, x: -8 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(ci * 0.025, 0.4) }}
                  className={`relative ${isPreviewActive ? 'bg-primary/[0.06]' : ''}`}
                >
                  {/* Barra de prioridade lateral */}
                  <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${prio.dot} ${prio.label === 'Baixa' ? 'opacity-30' : 'opacity-90'}`} />

                  <button
                    onClick={() => {
                      setExpandedCardId(isExpanded ? null : card.id);
                      if (previewUrl) setPreviewCardId(card.id);
                    }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/30 group"
                  >
                    {/* Avatar colorido com inicial */}
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${pal.bg} ${pal.text} text-sm font-bold shrink-0`}>
                      {initialOf(name)}
                    </div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground leading-snug truncate">{name}</p>
                        {/* Prioridade */}
                        <span className={`flex items-center gap-1 text-[10px] font-medium ${prio.color} shrink-0`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${prio.dot}`} />
                          {prio.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span className="truncate">{phone}</span>
                        {campaign && campaign !== '—' && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="truncate">{campaign}</span>
                          </>
                        )}
                      </p>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {tags.slice(0, 2).map(tag => (
                            <span key={tag.id} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                              <Tag className="h-2 w-2" />{tag.name}
                            </span>
                          ))}
                          {tags.length > 2 && <span className="text-[9px] text-muted-foreground self-center">+{tags.length - 2}</span>}
                        </div>
                      )}
                    </div>

                    {/* Score + etapa + ações */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      {/* Ações rápidas (aparecem no hover) */}
                      <div className="flex items-center gap-1 opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0">
                        {previewUrl && (
                          <span
                            onClick={(e) => { e.stopPropagation(); setPreviewCardId(card.id); setExpandedCardId(card.id); }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            title="Abrir chat"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </span>
                        )}
                        <span
                          onClick={(e) => { e.stopPropagation(); handleSyncCard(card.id); }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                          title="Sincronizar chat"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {/* Etapa */}
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full text-white truncate max-w-[110px]"
                          style={{ backgroundColor: STAGE_COLORS[stage] || 'hsl(var(--muted-foreground))' }}
                          title={getStepDisplayName(stage)}
                        >
                          {getStepDisplayName(stage)}
                        </span>
                      </div>
                    </div>
                  </button>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="px-5 pb-4 pl-12 space-y-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-3.5 w-3.5" /><span>{getContactPhone(card)}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Campanha:</span> {campaign}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Etapa:</span> {getStepDisplayName(classify(card))}
                          </div>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {tags.map(tag => (
                                <span key={tag.id} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                  <Tag className="h-2.5 w-2.5" />{tag.name}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            {previewUrl ? (
                              <>
                                <button
                                  onClick={() => { setPreviewCardId(card.id); setExpandedCardId(card.id); }}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
                                >
                                  <MessageCircle className="h-4 w-4" /> Preview Chat
                                </button>
                                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/80 transition-colors">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </>
                            ) : (
                              <button
                                onClick={() => handleSyncCard(card.id)}
                                disabled={syncingCardId === card.id}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-60"
                              >
                                <RefreshCw className={`h-4 w-4 ${syncingCardId === card.id ? 'animate-spin' : ''}`} />
                                {syncingCardId === card.id ? 'Sincronizando...' : 'Sincronizar Chat'}
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Chat preview panel */}
      {hasPreview ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">{previewCard ? getContactName(previewCard) : 'Chat'}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {previewCard && (
                  <>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{getContactPhone(previewCard)}</span>
                    <span className="truncate">{extractCampaign(previewCard)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a href={activePreviewUrl!} target="_blank" rel="noopener noreferrer" className="rounded-md p-1 hover:bg-muted transition-colors">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
              <button onClick={() => setPreviewCardId(null)} className="rounded-md p-1 hover:bg-muted transition-colors">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
          <iframe key={previewCardId} src={activePreviewUrl!} className="flex-1 w-full bg-background" title="Chat Preview" />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <MessageCircle className="h-10 w-10 mx-auto opacity-30" />
            <p className="text-sm">Selecione um lead e clique em "Preview Chat" para visualizar a conversa</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditPage;
