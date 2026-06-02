import { useState, useMemo, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { FUNNEL_STEPS, getStepDisplayName } from '@/utils/normalizeStep';
import { extractCampaign } from '@/utils/extractCampaign';
import { ExternalLink, Phone, User, ChevronDown, ChevronUp, MessageCircle, X, ClipboardCheck, Tag, RefreshCw, Search, Clock, Bot, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { syncCardSessions } from '@/lib/helenaSessionSync';
import { toast } from 'sonner';
import { computeScore, priorityOf, scoreColor, avatarPalette, initialOf, STAGE_COLORS } from '@/utils/leadScore';

const STAGE_COLORS: Record<string, string> = {
  'SDR': 'hsl(var(--kpi-blue))',
  'CLOSER': 'hsl(var(--kpi-cyan))',
  'CONTRATO': 'hsl(var(--kpi-amber))',
  'ETAPA DE ASSINATURA': 'hsl(var(--kpi-violet))',
  'CONTRATO FECHADO': 'hsl(var(--kpi-emerald))',
  'DESQUALIFICADO': 'hsl(var(--kpi-rose))',
};

const STAGE_EMOJIS: Record<string, string> = {
  'SDR': '📞', 'CLOSER': '🤝', 'CONTRATO': '📝',
  'ETAPA DE ASSINATURA': '✍️', 'CONTRATO FECHADO': '🏆', 'DESQUALIFICADO': '❌',
};

interface AuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'all' | 'closed';
  cards: Card[];
  sessions: Session[];
  initialStage?: string;
}

const AuditModal = ({ open, onOpenChange, mode, cards, sessions, initialStage }: AuditModalProps) => {
  const { classify } = useClassify();
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const [syncedOverrides, setSyncedOverrides] = useState<Map<string, Session>>(new Map());
  const [syncingCardId, setSyncingCardId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'recent' | 'tagged' | 'ia_off' | 'no_grace'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Redimensionamento do painel de leads (barra lateral arrastável)
  const [listWidth, setListWidth] = useState(420);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const w = Math.max(320, Math.min(760, dragRef.current.startW + dx));
      setListWidth(w);
    };
    const onUp = () => { dragRef.current = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  useEffect(() => {
    if (open && initialStage) {
      setActiveStage(initialStage);
    }
  }, [open, initialStage]);

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setExpandedCardId(null);
      setPreviewCardId(null);
      setActiveStage(null);
      setSyncedOverrides(new Map());
    }
    onOpenChange(v);
  };

  const sessionMap = useMemo(() => {
    const map = new Map<string, Session>();
    for (const s of sessions) {
      if (s.cardId && !map.has(s.cardId)) map.set(s.cardId, s);
    }
    for (const [cid, s] of syncedOverrides) map.set(cid, s);
    return map;
  }, [sessions, syncedOverrides]);

  // Build contact tags from sessions (coluna dedicada contact_tag_names, enriquecida via bulk de contatos)
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

  const availableSteps = useMemo(() => {
    if (mode === 'closed') return ['CONTRATO FECHADO'] as string[];
    return FUNNEL_STEPS as unknown as string[];
  }, [mode]);

  const filteredCards = useMemo(() => {
    let list = cards.filter(c => !c.archived);
    const q = search.trim().toLowerCase();

    // Quando HÁ busca, ela atravessa TODOS os departamentos/etapas
    // (ignora o filtro de etapa da sidebar). Sem busca, respeita a etapa selecionada.
    if (mode === 'closed') {
      list = list.filter(c => classify(c) === 'CONTRATO FECHADO');
    } else if (activeStage && !q) {
      list = list.filter(c => classify(c) === activeStage);
    }

    // Filtros rápidos (sempre aplicam, mesmo com busca)
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

    // Busca por nome / telefone / tag / etapa (departamento)
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
  }, [cards, mode, activeStage, classify, quickFilter, search, cardContactTags, sessionMap]);

  // Atalho ⌘K / Ctrl+K → foca busca
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

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
  // Use card.title (helena_cards name) as primary
  const getContactName = (card: Card): string => card.title || sessionMap.get(card.id)?.contactName || card.contacts?.[0]?.name || '—';

  const activePreviewUrl = previewCardId ? getPreviewUrl(previewCardId) : null;
  const hasPreview = !!activePreviewUrl;

  const previewCard = previewCardId ? cards.find(c => c.id === previewCardId) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={`${hasPreview ? 'max-w-[96vw]' : 'max-w-5xl'} h-[92vh] max-h-[92vh] w-full p-0 gap-0 overflow-hidden transition-all duration-300 [&>button.absolute]:hidden`}>
        <div className="flex h-full min-w-0">
          {/* Stage sidebar — esconde quando o preview abre (mais espaço) e em telas pequenas */}
          {mode === 'all' && !hasPreview && (
            <div className="hidden md:flex flex-col gap-1 border-r border-border px-3 py-5 bg-muted/30 w-[170px] shrink-0 overflow-y-auto">
              <button
                onClick={() => { setActiveStage(null); setExpandedCardId(null); }}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-all ${
                  !activeStage ? 'bg-background shadow-sm border border-border' : 'hover:bg-background/50'
                }`}
              >
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm shrink-0 ${!activeStage ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  📋
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-medium truncate ${!activeStage ? 'text-foreground' : 'text-muted-foreground'}`}>Todos</p>
                  <p className="text-[10px] text-muted-foreground">{cards.filter(c => !c.archived).length} leads</p>
                </div>
              </button>
              {availableSteps.map((step) => {
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
          )}

          {/* Lead list — largura limitada a 55% do modal pra nunca espremer o preview */}
          <div
            className={`flex flex-col min-w-0 ${hasPreview ? 'shrink-0' : 'flex-1'}`}
            style={hasPreview ? { width: `min(${listWidth}px, 55%)` } : undefined}
          >
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-border space-y-3">
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" />
                  <span className="text-lg font-bold tracking-tight">Auditoria de Atendimentos</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {filteredCards.length} {mode === 'closed' ? 'contratos' : 'leads'}
                  </span>
                </DialogTitle>

                {/* Busca com ⌘K */}
                <div className="relative hidden sm:block w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nome, telefone ou tags..."
                    className="h-9 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-12 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background transition-all"
                  />
                  <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">⌘K</kbd>
                </div>
              </div>

              {/* Filtros rápidos */}
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
                    <button
                      key={f.key}
                      onClick={() => setQuickFilter(f.key)}
                      className={`relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                        active
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      }`}
                    >
                      <f.icon className="h-3.5 w-3.5" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </DialogHeader>

            <ScrollArea className="flex-1 max-h-[82vh]">
              <div className="divide-y divide-border/50">
                {filteredCards.length === 0 && (
                  <div className="px-5 py-10 text-center text-muted-foreground text-sm">Nenhum lead encontrado</div>
                )}
                {filteredCards.map((card) => {
                  const isExpanded = expandedCardId === card.id;
                  const previewUrl = getPreviewUrl(card.id);
                  const campaign = extractCampaign(card);
                  const isPreviewActive = previewCardId === card.id;
                  const tags = cardContactTags.get(card.id) || [];

                    const stage = classify(card);
                    const name = getContactName(card);
                    const phone = getContactPhone(card);
                    const score = computeScore(stage, tags.length, phone !== '—', !!campaign && campaign !== '—');
                    const prio = priorityOf(score, stage);
                    const sc = scoreColor(score);
                    const pal = avatarPalette(name);

                    return (
                    <div key={card.id} className={`relative ${isPreviewActive ? 'bg-primary/[0.06]' : ''}`}>
                      {/* Barra de prioridade lateral */}
                      <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${prio.dot} ${prio.label === 'Baixa' ? 'opacity-30' : 'opacity-90'}`} />
                      <button
                        onClick={() => {
                          setExpandedCardId(isExpanded ? null : card.id);
                          if (previewUrl) setPreviewCardId(card.id);
                        }}
                        className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/30 group"
                      >
                        {/* Avatar colorido */}
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${pal.bg} ${pal.text} text-sm font-bold shrink-0`}>
                          {initialOf(name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                            <span className={`flex items-center gap-1 text-[10px] font-medium ${prio.color} shrink-0`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${prio.dot}`} />{prio.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span className="truncate">{phone}</span>
                            {campaign && campaign !== '—' && (<><span className="text-muted-foreground/40">·</span><span className="truncate">{campaign}</span></>)}
                          </p>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tags.slice(0, 2).map(tag => (
                                <span key={tag.id} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0 text-[9px] font-medium text-primary">
                                  <Tag className="h-2 w-2" />{tag.name}
                                </span>
                              ))}
                              {tags.length > 2 && <span className="text-[9px] text-muted-foreground self-center">+{tags.length - 2}</span>}
                            </div>
                          )}
                        </div>
                        {/* Etapa */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full text-white truncate max-w-[110px]"
                            style={{ backgroundColor: STAGE_COLORS[stage] || 'hsl(var(--muted-foreground))' }}
                          >
                            {getStepDisplayName(stage)}
                          </span>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                            <div className="px-5 pb-4 pl-12 space-y-2">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="h-3.5 w-3.5" />
                                <span>{getContactPhone(card)}</span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">Campanha:</span> {campaign}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">Etapa:</span> {getStepDisplayName(classify(card))}
                              </div>
                              {/* Contact Tags */}
                              {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {tags.map(tag => (
                                    <span
                                      key={tag.id}
                                      className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                                    >
                                      <Tag className="h-2.5 w-2.5" />
                                      {tag.name}
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
                                      <MessageCircle className="h-4 w-4" />
                                      Preview Chat
                                    </button>
                                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted/80 transition-colors" title="Abrir em nova aba">
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
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Handle de redimensionamento (arrastar como barra lateral) */}
          {hasPreview && (
            <div
              onMouseDown={(e) => {
                dragRef.current = { startX: e.clientX, startW: listWidth };
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
              }}
              className="group/handle relative w-1.5 shrink-0 cursor-col-resize bg-border/50 hover:bg-primary/50 transition-colors"
              title="Arraste para redimensionar"
            >
              <span className="absolute inset-y-0 -left-1 -right-1" />
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-muted-foreground/30 group-hover/handle:bg-primary/60 transition-colors" />
            </div>
          )}

          {/* Chat preview panel - PERSISTENT */}
          {hasPreview && (
            <div className="flex-1 flex flex-col border-l border-border min-w-[300px]">
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
                  {activePreviewUrl && (
                    <a href={activePreviewUrl} target="_blank" rel="noopener noreferrer" className="rounded-md p-1 hover:bg-muted transition-colors" title="Abrir em nova aba">
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </a>
                  )}
                  <button onClick={() => setPreviewCardId(null)} className="rounded-md p-1 hover:bg-muted transition-colors" title="Fechar preview">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <iframe key={previewCardId} src={activePreviewUrl!} className="flex-1 w-full min-h-[70vh] bg-background" title="Chat Preview" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuditModal;
