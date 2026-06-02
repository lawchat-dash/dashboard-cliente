import { useState, useEffect, useMemo } from 'react';
import { useLiveMessages, LiveSession, TimeWindow, SessionHealth } from '@/hooks/useLiveMessages';
import { MessageCircle, Phone, User, Radio, ExternalLink, Search, Flame, Building2, GitBranch, AlertTriangle, Tag, ShieldAlert, HelpCircle, SlidersHorizontal, Check } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { markResolved } from '@/lib/resolvedAlerts';
import { useToast } from '@/hooks/use-toast';

interface LiveChatPageProps {
  clientId?: string;
}

const TIME_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '3h', label: '3h' },
  { value: '5h', label: '5h' },
  { value: '12h', label: '12h' },
  { value: '24h', label: '24h' },
];

const DIRECTION_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'FROM_HUB', label: 'Recebidas' },
  { value: 'TO_HUB', label: 'Enviadas' },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}


const HEALTH_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'red', label: '🔴 Crítico' },
  { value: 'yellow', label: '🟡 Atenção' },
  { value: 'alert', label: '⚠️ Alertas' },
];

const LiveChatPage = ({ clientId }: LiveChatPageProps) => {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1h');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [crmStepFilter, setCrmStepFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { sessions, loading, hasActiveMessages, refetch } = useLiveMessages(clientId, timeWindow);

  // Extract unique CRM steps from all sessions
  const uniqueCrmSteps = useMemo(() => {
    const steps = new Set<string>();
    sessions.forEach(s => { if (s.step_title?.trim()) steps.add(s.step_title.trim()); });
    return Array.from(steps).sort();
  }, [sessions]);

  // Filter sessions
  const filteredSessions = useMemo(() => {
    let result = sessions;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        (s.contact_name?.toLowerCase().includes(q)) ||
        (s.contact_phone?.includes(q))
      );
    }

    if (healthFilter !== 'all') {
      if (healthFilter === 'alert') {
        result = result.filter(s => s.health === 'red' || s.health === 'yellow');
      } else {
        result = result.filter(s => s.health === healthFilter);
      }
    }

    if (crmStepFilter.length > 0) {
      result = result.filter(s => s.step_title && crmStepFilter.includes(s.step_title.trim()));
    }

    if (directionFilter !== 'all') {
      result = result
        .map(s => ({
          ...s,
          messages: s.messages.filter(m => m.direction === directionFilter),
          message_count: s.messages.filter(m => m.direction === directionFilter).length,
        }))
        .filter(s => s.messages.length > 0);
    }

    return result;
  }, [sessions, search, directionFilter, healthFilter, crmStepFilter]);

  const selectedSession = filteredSessions.find(s => s.session_id === selectedSessionId) || null;

  useEffect(() => {
    if (!selectedSessionId && filteredSessions.length > 0) {
      setSelectedSessionId(filteredSessions[0].session_id);
    }
  }, [filteredSessions, selectedSessionId]);

  const totalMessages = filteredSessions.reduce((sum, s) => sum + s.message_count, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm">Carregando conversas...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] rounded-xl border border-border bg-card overflow-hidden">
      {/* Session list */}
      <div className="w-[340px] border-r border-border flex flex-col shrink-0 bg-muted/20">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Radio className="h-4 w-4 text-primary" />
                <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
              </div>
              <h2 className="text-sm font-bold text-foreground">Conversas ao Vivo</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] text-primary/70 bg-primary/5 rounded-full px-2 py-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                </span>
                Tempo real
              </span>
            </div>
          </div>

          {/* Time window selector */}
          <ToggleGroup
            type="single"
            value={timeWindow}
            onValueChange={(v) => v && setTimeWindow(v as TimeWindow)}
            className="w-full bg-muted/50 rounded-lg p-0.5"
          >
            {TIME_OPTIONS.map(opt => (
              <ToggleGroupItem
                key={opt.value}
                value={opt.value}
                className="flex-1 text-[11px] h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-md"
              >
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {/* Filters button */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={`flex items-center justify-center gap-1.5 w-full h-8 text-xs font-medium rounded-lg border transition-colors ${
                directionFilter !== 'all' || healthFilter !== 'all' || crmStepFilter.length > 0
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filtros
                {(directionFilter !== 'all' || healthFilter !== 'all' || crmStepFilter.length > 0) && (
                  <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                    {(directionFilter !== 'all' ? 1 : 0) + (healthFilter !== 'all' ? 1 : 0) + (crmStepFilter.length > 0 ? 1 : 0)}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-[300px] p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">Direção</p>
              <ToggleGroup
                type="single"
                value={directionFilter}
                onValueChange={(v) => v && setDirectionFilter(v)}
                className="w-full bg-muted/50 rounded-lg p-0.5"
              >
                {DIRECTION_OPTIONS.map(opt => (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    className="flex-1 text-[11px] h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-md"
                  >
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs font-semibold text-foreground">Status do Lead</p>
              <ToggleGroup
                type="single"
                value={healthFilter}
                onValueChange={(v) => v && setHealthFilter(v)}
                className="w-full bg-muted/50 rounded-lg p-0.5"
              >
                {HEALTH_FILTER_OPTIONS.map(opt => (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    className="flex-1 text-[11px] h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-md"
                  >
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {/* CRM Step Filter */}
              {uniqueCrmSteps.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-foreground">Etapa CRM</p>
                  <div className="flex flex-wrap gap-1.5">
                    {uniqueCrmSteps.map(step => {
                      const isSelected = crmStepFilter.includes(step);
                      return (
                        <button
                          key={step}
                          onClick={() => {
                            setCrmStepFilter(prev =>
                              isSelected ? prev.filter(s => s !== step) : [...prev, step]
                            );
                          }}
                          className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1 border transition-colors ${
                            isSelected
                              ? 'bg-primary/15 border-primary/40 text-primary'
                              : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                        >
                          <GitBranch className="h-2.5 w-2.5 shrink-0" />
                          {step}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {(directionFilter !== 'all' || healthFilter !== 'all' || crmStepFilter.length > 0) && (
                <button
                  onClick={() => { setDirectionFilter('all'); setHealthFilter('all'); setCrmStepFilter([]); }}
                  className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  Limpar filtros
                </button>
              )}
            </PopoverContent>
          </Popover>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          {/* Stats */}
          {(() => {
            const redCount = filteredSessions.filter(s => s.health === 'red').length;
            const yellowCount = filteredSessions.filter(s => s.health === 'yellow').length;
            return (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg bg-background border border-border px-3 py-1.5 text-center">
                  <p className="text-base font-bold text-foreground leading-none">{filteredSessions.length}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">chats</p>
                </div>
                <div className="flex-1 rounded-lg bg-background border border-border px-3 py-1.5 text-center">
                  <p className="text-base font-bold text-foreground leading-none">{totalMessages}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">msgs</p>
                </div>
                {(redCount > 0 || yellowCount > 0) && (
                  <div className="flex-1 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-1.5 text-center">
                    <p className="text-base font-bold text-destructive leading-none">{redCount + yellowCount}</p>
                    <p className="text-[10px] text-destructive/70 mt-0.5">alertas</p>
                  </div>
                )}
              </div>
            );
          })()}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors bg-muted/50 hover:bg-muted rounded-full px-2.5 py-1">
                <HelpCircle className="h-3 w-3" />
                Legenda de cores
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-64 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-foreground">Status dos leads</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
                  <div>
                    <p className="text-[11px] font-medium text-foreground">Normal</p>
                    <p className="text-[10px] text-muted-foreground">Conversa fluindo normalmente</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                  <div>
                    <p className="text-[11px] font-medium text-foreground">Inativo 3h+</p>
                    <p className="text-[10px] text-muted-foreground">Lead sem interação há mais de 3 horas</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive shrink-0" />
                  <div>
                    <p className="text-[11px] font-medium text-foreground">Sem resposta 10min+</p>
                    <p className="text-[10px] text-muted-foreground">Lead enviou mensagem e a IA não respondeu há mais de 10 minutos — possível bug</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-orange-500 shrink-0" />
                  <div>
                    <p className="text-[11px] font-medium text-foreground">Atividade intensa</p>
                    <p className="text-[10px] text-muted-foreground">3+ mensagens nos últimos 5 minutos</p>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {!hasActiveMessages && !search ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground px-4">
            <div className="h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center">
              <Radio className="h-6 w-6 opacity-40" />
            </div>
            <p className="text-sm font-medium text-foreground/70">Nenhuma conversa ativa</p>
            <p className="text-xs text-muted-foreground text-center">Mensagens das últimas {timeWindow} aparecerão aqui</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground px-4">
            <Search className="h-6 w-6 opacity-40" />
            <p className="text-xs">Nenhum resultado para "{search}"</p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="flex flex-col p-2 gap-1">
              <AnimatePresence initial={false}>
                {filteredSessions.map((session) => (
                  <motion.div
                    key={session.session_id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    <SessionItem
                      session={session}
                      isActive={selectedSessionId === session.session_id}
                      onClick={() => setSelectedSessionId(session.session_id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedSession ? (
          <>
            {selectedSession.health !== 'green' && (
              <ResolveBar session={selectedSession} />
            )}
            <iframe
              key={selectedSession.session_id}
              src={`https://advmidia.wts.chat/chat2/sessions/${selectedSession.session_id}/preview`}
              className="flex-1 w-full border-0 bg-background"
              title="Chat Preview"
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <MessageCircle className="h-10 w-10 mx-auto opacity-20" />
              <p className="text-sm">Selecione uma conversa para visualizar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function ResolveBar({ session }: { session: LiveSession }) {
  const { toast } = useToast();
  const isRed = session.health === 'red';
  const Icon = isRed ? ShieldAlert : AlertTriangle;
  const colorBg = isRed ? 'bg-destructive/10 border-destructive/30' : 'bg-amber-500/10 border-amber-500/30';
  const colorText = isRed ? 'text-destructive' : 'text-amber-600 dark:text-amber-500';

  const handleResolve = () => {
    markResolved(session.session_id, session.last_message_at);
    toast({ title: 'Alerta resolvido', description: 'Voltará se houver nova mensagem do lead.' });
  };

  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2 border-b ${colorBg}`}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`h-4 w-4 shrink-0 ${colorText}`} />
        <p className={`text-xs font-medium truncate ${colorText}`}>
          {session.healthReason || 'Alerta ativo'}
        </p>
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleResolve}>
        <Check className="h-3 w-3" />
        Marcar resolvido
      </Button>
    </div>
  );
}

const TAG_COLORS = [
  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'bg-pink-500/15 text-pink-400 border-pink-500/30',
  'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  'bg-amber-500/15 text-amber-400 border-amber-500/30',
];

const HEALTH_STYLES: Record<SessionHealth, { border: string; bg: string; icon: string }> = {
  green: { border: 'border-border/30', bg: '', icon: '' },
  yellow: { border: 'border-amber-500/40', bg: 'bg-amber-500/5', icon: 'text-amber-500' },
  red: { border: 'border-destructive/40', bg: 'bg-destructive/5', icon: 'text-destructive' },
};

function SessionItem({ session, isActive, onClick }: { session: LiveSession; isActive: boolean; onClick: () => void }) {
  const lastMsg = session.messages[session.messages.length - 1];
  const isHot = session.recentActivity >= 3;
  const hs = HEALTH_STYLES[session.health];

  const borderClass = isActive
    ? 'bg-primary/10 border border-primary/20 shadow-sm'
    : session.health !== 'green'
      ? `hover:${hs.bg} border ${hs.border} ${hs.bg}`
      : isHot
        ? 'hover:bg-orange-500/5 border border-orange-500/20 bg-orange-500/5'
        : 'hover:bg-muted/50 border border-border/30';

  return (
    <TooltipProvider delayDuration={300}>
      <button
        onClick={onClick}
        className={`w-full text-left rounded-lg transition-all px-3 py-3 ${borderClass}`}
      >
        <div className="flex items-start gap-3">
          <div className="relative shrink-0 mt-0.5">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
              session.health === 'red' ? 'bg-destructive/15' :
              session.health === 'yellow' ? 'bg-amber-500/15' :
              isActive ? 'bg-primary/15' : isHot ? 'bg-orange-500/10' : 'bg-muted'
            }`}>
              {session.health === 'red' ? (
                <ShieldAlert className="h-4 w-4 text-destructive" />
              ) : session.health === 'yellow' ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : isHot && !isActive ? (
                <Flame className="h-4 w-4 text-orange-500" />
              ) : (
                <User className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              )}
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${
              session.health === 'red' ? 'bg-destructive' :
              session.health === 'yellow' ? 'bg-amber-500' :
              'bg-primary'
            }`} />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm font-semibold leading-snug truncate max-w-[180px] ${isActive ? 'text-foreground' : 'text-foreground/90'}`}>
                {session.contact_name || session.contact_phone || 'Desconhecido'}
              </p>
              <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(session.last_message_at)}</span>
            </div>
            {session.contact_phone && session.contact_name && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{session.contact_phone}</span>
              </p>
            )}
            {/* Health alert banner */}
            {session.health !== 'green' && session.healthReason && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 mt-1 ${
                    session.health === 'red'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-amber-500/10 text-amber-500'
                  }`}>
                    {session.health === 'red' ? <ShieldAlert className="h-2.5 w-2.5 shrink-0" /> : <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
                    <span className="truncate">{session.healthReason}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px] text-xs">
                  {session.health === 'red' ? 'Possível problema — verificar manualmente' : 'IA pode estar demorando para responder'}
                </TooltipContent>
              </Tooltip>
            )}
            {lastMsg && session.health === 'green' && (
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-2 mt-1">
                {lastMsg.direction === 'FROM_HUB' ? '👤 ' : '🤖 '}
                {lastMsg.text.substring(0, 80)}{lastMsg.text.length > 80 ? '…' : ''}
              </p>
            )}
            {/* Tags */}
            {session.tags.length > 0 && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {session.tags.slice(0, 3).map((tag, i) => (
                  <span key={i} className={`inline-flex items-center text-[9px] font-medium gap-0.5 rounded-full px-1.5 py-0.5 border ${TAG_COLORS[i % TAG_COLORS.length]}`}>
                    <Tag className="h-2 w-2 shrink-0" />
                    <span className="truncate max-w-[90px]">{tag}</span>
                  </span>
                ))}
                {session.tags.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">+{session.tags.length - 3}</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="inline-flex items-center text-[10px] text-muted-foreground gap-1 bg-muted/60 rounded-full px-2 py-0.5">
                <MessageCircle className="h-2.5 w-2.5" />
                {session.message_count}
              </span>
              {/* Show only the most relevant context: step > department > agent (pick one) */}
              {(() => {
                const step = session.step_title?.trim() || null;
                const dept = session.department_name?.trim() || null;
                const agent = session.agent_name?.trim() || null;
                // Priority: step_title is the most "advanced" info
                if (step) {
                  return (
                    <span className="inline-flex items-center text-[10px] text-primary gap-0.5 bg-primary/10 rounded-full px-2 py-0.5 truncate max-w-[140px]">
                      <GitBranch className="h-2.5 w-2.5 shrink-0" />
                      {step}
                    </span>
                  );
                }
                // Fallback: department or agent
                const label = dept || agent;
                if (label) {
                  return (
                    <span className="inline-flex items-center text-[10px] text-muted-foreground gap-0.5 bg-muted/60 rounded-full px-2 py-0.5 truncate max-w-[140px]">
                      <Building2 className="h-2.5 w-2.5 shrink-0" />
                      {label}
                    </span>
                  );
                }
                return null;
              })()}
              {isHot && session.health === 'green' && (
                <span className="inline-flex items-center text-[10px] text-orange-500 gap-0.5 bg-orange-500/10 rounded-full px-2 py-0.5">
                  <Flame className="h-2.5 w-2.5" />
                  {session.recentActivity} recentes
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </TooltipProvider>
  );
}

export default LiveChatPage;
