import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, X, Clock, MessageCircle, ExternalLink, ChevronDown, ChevronUp, Filter, CalendarIcon, Users, Radio, User, UserCheck, CheckCircle, Zap, RotateCw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { playNotificationSoundByStatus } from '@/utils/notificationSounds';

interface Props {
  clientId?: string;
  currentUserName?: string | null;
  currentUserHelenaId?: string | null;
}

interface LeadCard {
  id: string;
  client_id: string | null;
  user_name: string | null;
  user_number: string | null;
  agente: string | null;
  id_chat: string | null;
  id_linkconversa: string | null;
  id_cardcrm: string | null;
  idcontato: string | null;
  id_campanha_link: string | null;
  external_id: number | null;
  external_status: string | null;
  status: string | null;
  pipeline_stage: string;
  evaluation_stage: string;
  assigned_to: string | null;
  horario_notificacao: string | null;
  created_at: string;
  synced_at: string;
}

type TabFilter = 'new' | 'assigned' | 'resolved';
type PeriodFilter = 'today' | 'yesterday' | '7d' | '30d' | 'all';
type CategoryFilter = 'all' | 'lead_qualificado' | 'contrato_elaboracao' | 'aguardando_assinatura' | 'contrato_assinado' | 'intervencao_humana';

const CATEGORY_STATUS_MAP: Record<Exclude<CategoryFilter, 'all' | 'intervencao_humana'>, string[]> = {
  lead_qualificado: ['Lead Qualificado', 'Qualificado'],
  contrato_elaboracao: ['Lead Confecção de Contrato', 'Confecção de Contrato'],
  aguardando_assinatura: ['Lead Dificuldade Assinatura', 'Dificuldade Assinatura'],
  contrato_assinado: ['Lead Contrato Assinado', 'Contrato Assinado'],
};

const KNOWN_STATUSES = Object.values(CATEGORY_STATUS_MAP).flat();

const CATEGORY_CONFIG: { value: CategoryFilter; label: string; emoji: string; priority: number; borderColor: string; dotColor: string }[] = [
  { value: 'contrato_assinado', label: 'Assinado', emoji: '✅', priority: 1, borderColor: 'border-l-emerald-500', dotColor: 'bg-emerald-500' },
  { value: 'aguardando_assinatura', label: 'Assinatura', emoji: '✍️', priority: 2, borderColor: 'border-l-amber-500', dotColor: 'bg-amber-500' },
  { value: 'contrato_elaboracao', label: 'Elaboração', emoji: '📝', priority: 3, borderColor: 'border-l-blue-500', dotColor: 'bg-blue-500' },
  { value: 'lead_qualificado', label: 'Qualificado', emoji: '🎯', priority: 4, borderColor: 'border-l-muted-foreground/40', dotColor: 'bg-slate-500' },
  { value: 'intervencao_humana', label: 'Intervenção', emoji: '🚨', priority: 0, borderColor: 'border-l-destructive', dotColor: 'bg-red-500' },
];

const PERIOD_CONFIG: { value: PeriodFilter; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'Todos' },
];

const TAB_CONFIG: { value: TabFilter; label: string; icon: typeof Radio }[] = [
  { value: 'new', label: 'Novas Notificações', icon: Radio },
  { value: 'assigned', label: 'Minhas Notificações', icon: User },
  { value: 'resolved', label: 'Resolvidas', icon: CheckCircle },
];

const STATUS_EMOJI_MAP: Record<string, string> = {
  'Lead Qualificado': '🎯',
  'Qualificado': '🎯',
  'Lead Confecção de Contrato': '📝',
  'Confecção de Contrato': '📝',
  'Lead Dificuldade Assinatura': '✍️',
  'Dificuldade Assinatura': '✍️',
  'Lead Contrato Assinado': '✅',
  'Contrato Assinado': '✅',
};

function getStatusEmoji(status: string | null): string {
  if (!status) return '📩';
  for (const [key, emoji] of Object.entries(STATUS_EMOJI_MAP)) {
    if (key.toLowerCase() === status.toLowerCase()) return emoji;
  }
  return '🚨';
}

function getStatusDot(status: string | null): string {
  if (!status) return 'bg-muted-foreground/40';
  const lower = status.toLowerCase();
  if (lower.includes('assinado')) return 'bg-emerald-500';
  if (lower.includes('assinatura') || lower.includes('dificuldade')) return 'bg-amber-500';
  if (lower.includes('confecção') || lower.includes('elabora')) return 'bg-blue-500';
  if (lower.includes('qualificado')) return 'bg-slate-400';
  return 'bg-red-500';
}

function getLeadPriorityBorder(externalStatus: string | null): string {
  if (!externalStatus) return 'border-l-muted-foreground/30';
  const lower = externalStatus.toLowerCase();
  if (lower.includes('assinado')) return 'border-l-emerald-500';
  if (lower.includes('assinatura') || lower.includes('dificuldade')) return 'border-l-amber-500';
  if (lower.includes('confecção') || lower.includes('elabora')) return 'border-l-blue-500';
  if (lower.includes('qualificado')) return 'border-l-muted-foreground/40';
  return 'border-l-destructive';
}

const EVALUATION_OPTIONS = [
  { value: 'novo', label: 'Novo', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'resolvendo', label: 'Resolvendo', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { value: 'aguardando', label: 'Aguardando', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'resolvido', label: 'Resolvido', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
];


const NotificationsPage = ({ clientId, currentUserName, currentUserHelenaId }: Props) => {
  const [leads, setLeads] = useState<LeadCard[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>('new');
  const [selectedLead, setSelectedLead] = useState<(LeadCard & { _groupIds?: string[]; _groupCount?: number; _timeline?: LeadCard[] }) | null>(null);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('today');
  const [showDateFilter, setShowDateFilter] = useState(false);
  type ModalTabFilter = 'novos' | 'meus' | 'outros';
  const [modalTab, setModalTab] = useState<ModalTabFilter>('novos');
  const [categoryFilters, setCategoryFilters] = useState<Set<CategoryFilter>>(new Set());
  const [assignedFilter, setAssignedFilter] = useState<string>('__all__');
  const { toast } = useToast();

  const actorName = currentUserName || 'Desconhecido';

  const logAction = async (actionType: string, leadIds: string[], details: Record<string, unknown> = {}) => {
    try {
      await supabase.from('notification_action_logs').insert([{
        client_id: clientId || undefined,
        actor_name: actorName,
        actor_helena_user_id: currentUserHelenaId || undefined,
        action_type: actionType,
        lead_ids: leadIds,
        details: details as any,
      }]);
    } catch (e) {
      console.error('Failed to log action:', e);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    let leadsQuery = supabase.from('notificativo_leads').select('*').order('created_at', { ascending: false });
    let sessionsQuery = supabase.from('helena_sessions').select('agent_name');
    let cardsQuery = supabase.from('helena_cards').select('responsible_user');

    if (clientId) {
      leadsQuery = leadsQuery.eq('client_id', clientId);
      sessionsQuery = sessionsQuery.eq('client_id', clientId);
      cardsQuery = cardsQuery.eq('client_id', clientId);
    }

    const [leadsResult, sessionsResult, cardsResult] = await Promise.all([leadsQuery, sessionsQuery, cardsQuery]);

    if (leadsResult.error) {
      toast({ title: 'Erro ao carregar leads', description: leadsResult.error.message, variant: 'destructive' });
    }
    setLeads((leadsResult.data as LeadCard[] | null) || []);

    const nameSet = new Set<string>();
    (sessionsResult.data || []).forEach((row: any) => {
      if (row.agent_name) nameSet.add(row.agent_name);
    });
    (cardsResult.data || []).forEach((row: any) => {
      const name = row.responsible_user?.name;
      if (name) nameSet.add(name);
    });
    setAgents(Array.from(nameSet).sort().map((name) => ({ id: name, name })));
    setLoading(false);
  }, [clientId, toast]);

  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFetch = useCallback(() => {
    if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
    realtimeTimerRef.current = setTimeout(() => { fetchData(); }, 2000);
  }, [fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('notificativo-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificativo_leads' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const newLead = payload.new as any;
          playNotificationSoundByStatus(newLead.external_status || newLead.status);
        }
        debouncedFetch();
      })
      .subscribe();
    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [clientId, debouncedFetch]);

  useEffect(() => {
    if (activeTab === 'assigned' && currentUserName) {
      setAssignedFilter(currentUserName);
    }
  }, [activeTab, currentUserName]);

  const periodFilteredLeads = useMemo(() => {
    if (periodFilter === 'all') return leads;
    const now = new Date();
    let start: Date;
    if (periodFilter === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (periodFilter === 'yesterday') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return leads.filter((l) => {
        const d = new Date(l.horario_notificacao || l.created_at);
        return d >= start && d < end;
      });
    } else if (periodFilter === '7d') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    return leads.filter((l) => new Date(l.horario_notificacao || l.created_at) >= start);
  }, [leads, periodFilter]);

  const groupedLeads = useMemo(() => {
    const groups = new Map<string, LeadCard[]>();
    periodFilteredLeads.forEach((l) => {
      const key = l.user_number || l.id;
      const existing = groups.get(key) || [];
      existing.push(l);
      groups.set(key, existing);
    });
    const result: (LeadCard & { _groupCount: number; _groupIds: string[]; _groupStatuses: string; _groupStatusList: string[]; _timeline: LeadCard[] })[] = [];
    groups.forEach((group) => {
      group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const uniqueStatuses = [...new Set(group.map(g => g.external_status).filter(Boolean))];
      result.push({
        ...group[0],
        _groupCount: group.length,
        _groupIds: group.map((g) => g.id),
        _groupStatuses: uniqueStatuses.join(' / ') || group[0].external_status || '',
        _groupStatusList: uniqueStatuses,
        _timeline: (() => {
          const seen = new Set<string>();
          return group.filter(g => {
            const key = (g.external_status || '').toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        })(),
      });
    });
    return result;
  }, [periodFilteredLeads]);

  const filteredLeads = useMemo(() => {
    let result = groupedLeads.filter((l) => {
      const isResolved = l.pipeline_stage === 'arquivado' || l.status === 'resolved';
      switch (activeTab) {
        case 'new': return !isResolved && l.pipeline_stage !== 'meus' && !l.assigned_to;
        case 'assigned': return !isResolved && (l.pipeline_stage === 'meus' || !!l.assigned_to);
        case 'resolved': return isResolved;
        default: return true;
      }
    });

    if (categoryFilters.size > 0) {
      result = result.filter((l: any) => {
        const statuses: string[] = (l._groupStatusList?.length > 0) ? l._groupStatusList : [(l.external_status || '').trim()];
        for (const cf of categoryFilters) {
          if (cf === 'intervencao_humana') {
            if (statuses.some(st => !KNOWN_STATUSES.some(s => s.toLowerCase() === st.toLowerCase()))) return true;
          } else {
            const allowed = CATEGORY_STATUS_MAP[cf];
            if (statuses.some(st => allowed.some(s => s.toLowerCase() === st.toLowerCase()))) return true;
          }
        }
        return false;
      });
    }
    if (assignedFilter !== '__all__') {
      result = result.filter((l) => (l.assigned_to || '') === assignedFilter);
    }
    return result;
  }, [groupedLeads, activeTab, categoryFilters, assignedFilter]);

  const categoryCounts = useMemo(() => {
    const tabFiltered = groupedLeads.filter((l) => {
      const isResolved = l.pipeline_stage === 'arquivado' || l.status === 'resolved';
      switch (activeTab) {
        case 'new': return !isResolved && l.pipeline_stage !== 'meus' && !l.assigned_to;
        case 'assigned': return !isResolved && (l.pipeline_stage === 'meus' || !!l.assigned_to);
        case 'resolved': return isResolved;
        default: return true;
      }
    });
    const c: Record<CategoryFilter, number> = { all: tabFiltered.length, lead_qualificado: 0, contrato_elaboracao: 0, aguardando_assinatura: 0, contrato_assinado: 0, intervencao_humana: 0 };
    tabFiltered.forEach((l: any) => {
      const statuses: string[] = (l._groupStatusList?.length > 0) ? l._groupStatusList : [(l.external_status || '').trim()];
      const matched = new Set<string>();
      statuses.forEach(status => {
        let found = false;
        for (const [key, values] of Object.entries(CATEGORY_STATUS_MAP)) {
          if (values.some(s => s.toLowerCase() === status.toLowerCase())) { matched.add(key); found = true; break; }
        }
        if (!found) matched.add('intervencao_humana');
      });
      matched.forEach(cat => c[cat as CategoryFilter]++);
    });
    return c;
  }, [groupedLeads, activeTab]);

  const counts = useMemo(() => {
    const c = { new: 0, assigned: 0, resolved: 0 };
    groupedLeads.forEach((l) => {
      if (l.pipeline_stage === 'arquivado' || l.status === 'resolved') c.resolved++;
      else if (l.pipeline_stage === 'meus' || l.assigned_to) c.assigned++;
      else c.new++;
    });
    return c;
  }, [groupedLeads]);

  const assignResponsible = async (groupIds: string[], agentName: string | null) => {
    const updates: Record<string, unknown> = { assigned_to: agentName, pipeline_stage: agentName ? 'meus' : 'lead_qualificado' };
    const { error } = await supabase.from('notificativo_leads').update(updates).in('id', groupIds);
    if (error) {
      toast({ title: 'Erro ao atribuir', description: error.message, variant: 'destructive' });
    } else {
      setLeads(prev => prev.map(l => groupIds.includes(l.id) ? { ...l, assigned_to: agentName, pipeline_stage: agentName ? 'meus' : 'lead_qualificado' } : l));
      await logAction(agentName ? 'assign' : 'unassign', groupIds, { assigned_to: agentName });
    }
  };

  const changeEvaluation = async (groupIds: string[], stage: string) => {
    const updates: Record<string, unknown> = { evaluation_stage: stage };
    if (stage === 'resolvido') { updates.pipeline_stage = 'arquivado'; updates.status = 'resolved'; }
    else { updates.pipeline_stage = 'meus'; updates.status = 'active'; }
    const { error } = await supabase.from('notificativo_leads').update(updates).in('id', groupIds);
    if (error) {
      toast({ title: 'Erro ao alterar avaliação', description: error.message, variant: 'destructive' });
    } else {
      setLeads(prev => prev.map(l => groupIds.includes(l.id) ? { ...l, ...updates as Partial<LeadCard> } : l));
      if (stage === 'resolvido') setSelectedLead(null);
      await logAction('evaluate', groupIds, { evaluation_stage: stage });
    }
  };

  const resolveCard = async (groupIds: string[]) => {
    const { error } = await supabase.from('notificativo_leads').update({ pipeline_stage: 'arquivado', status: 'resolved' }).in('id', groupIds);
    if (error) {
      toast({ title: 'Erro ao resolver', description: error.message, variant: 'destructive' });
    } else {
      setLeads(prev => prev.map(l => groupIds.includes(l.id) ? { ...l, pipeline_stage: 'arquivado', status: 'resolved' } : l));
      setSelectedLead(null);
      await logAction('resolve', groupIds, {});
    }
  };

  const openConversaAndAssign = async (lead: LeadCard & { _groupIds?: string[]; _groupCount?: number; _timeline?: LeadCard[] }) => {
    setSelectedLead(lead);
    if (currentUserName && !lead.assigned_to) {
      const groupIds = lead._groupIds || [lead.id];
      await assignResponsible(groupIds, currentUserName);
      await logAction('auto_assign_open', groupIds, { assigned_to: currentUserName });
    }
  };

  const [syncing, setSyncing] = useState(false);
  const syncSingleLead = async (lead: LeadCard) => {
    if (!lead.external_id && !lead.user_number) {
      toast({ title: 'Sem dados para sincronizar', description: 'Lead sem ID externo ou telefone', variant: 'destructive' });
      return;
    }
    setSyncing(true);
    try {
      const body: Record<string, unknown> = {};
      if (lead.external_id) body.externalId = lead.external_id;
      else if (lead.user_number) body.userNumber = lead.user_number;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-single-lead`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Erro ao sincronizar', description: data.error || 'Falha na sincronização', variant: 'destructive' });
      } else {
        toast({ title: 'Sincronizado!', description: `${data.synced} registro(s) atualizado(s)` });
        await fetchData();
      }
    } catch (err: any) {
      toast({ title: 'Erro de conexão', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (categoryFilters.size > 0) count++;
    if (assignedFilter !== '__all__') count++;
    if (periodFilter !== 'all') count++;
    return count;
  }, [categoryFilters, assignedFilter, periodFilter]);

  // Modal tab counts (within filteredLeads)
  const modalTabCounts = useMemo(() => {
    const c = { novos: 0, meus: 0, outros: 0 };
    filteredLeads.forEach((l) => {
      if (!l.assigned_to) c.novos++;
      else if (currentUserName && l.assigned_to === currentUserName) c.meus++;
      else c.outros++;
    });
    return c;
  }, [filteredLeads, currentUserName]);

  const modalFilteredLeads = useMemo(() => {
    return filteredLeads.filter((l) => {
      switch (modalTab) {
        case 'novos': return !l.assigned_to;
        case 'meus': return currentUserName && l.assigned_to === currentUserName;
        case 'outros': return l.assigned_to && l.assigned_to !== currentUserName;
        default: return true;
      }
    });
  }, [filteredLeads, modalTab, currentUserName]);

  const heroCount = counts[activeTab];
  const heroN = heroCount;
  const heroStatusColor = heroN > 10 ? 'border-destructive' : heroN >= 6 ? 'border-orange-500' : heroN >= 1 ? 'border-yellow-500' : 'border-emerald-500';
  const heroBgColor = heroN > 10 ? 'bg-destructive' : heroN >= 6 ? 'bg-orange-500' : heroN >= 1 ? 'bg-yellow-500' : 'bg-emerald-500';
  const heroLabel = activeTab === 'new' ? 'grupos aguardando' : activeTab === 'assigned' ? 'em acompanhamento' : 'resolvidos';
  const sectionLabel = activeTab === 'new' ? 'PENDENTES' : activeTab === 'assigned' ? 'MINHAS' : 'RESOLVIDAS';
  const SectionIcon = activeTab === 'new' ? Radio : activeTab === 'assigned' ? User : CheckCircle;

  return (
    <div className="flex flex-col gap-5 h-full font-sans">

      {/* ── Top Navigation Pills ── */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;
          const count = counts[tab.value];
          return (
            <button
              key={tab.value}
              onClick={() => { setActiveTab(tab.value); setCategoryFilters(new Set()); setAssignedFilter(tab.value === 'assigned' && currentUserName ? currentUserName : '__all__'); setSelectedLead(null); }}
              className={cn(
                "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? 'bg-primary/10 text-primary border border-primary/30 shadow-sm'
                  : 'bg-card border border-border/50 text-muted-foreground hover:text-foreground hover:border-border hover:bg-card/90'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                  isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Hero: Compact pulsing indicator ── */}
      <div className="flex flex-col items-center justify-center py-8">
        <div className="relative flex items-center justify-center mb-4" style={{ width: 200, height: 200 }}>
          <motion.span
            className={cn("absolute rounded-full border opacity-10", heroStatusColor)}
            style={{ width: 190, height: 190, borderWidth: 2 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
          />
          <span className={cn(
            "absolute rounded-full border-2 opacity-15 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]",
            heroStatusColor
          )} style={{ width: 170, height: 170 }} />
          <span className={cn(
            "absolute rounded-full border-2 opacity-20 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite_0.5s]",
            heroStatusColor
          )} style={{ width: 140, height: 140 }} />
          <span className={cn(
            "absolute rounded-full border-2 opacity-25 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite_1s]",
            heroStatusColor
          )} style={{ width: 115, height: 115 }} />
          <motion.span
            className={cn("absolute rounded-full opacity-10", heroBgColor)}
            style={{ width: 100, height: 100 }}
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className={cn(
              "relative z-10 flex items-center justify-center rounded-full text-white text-4xl font-bold shadow-2xl",
              heroBgColor
            )}
            style={{ width: 80, height: 80 }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            {heroN}
          </motion.div>
        </div>
        <motion.h2
          className="text-xl font-bold tracking-tight text-foreground"
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {heroN} {heroLabel}
        </motion.h2>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="mt-3 h-8 gap-1.5 rounded-lg text-xs">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* ── Filter Bar — compact, centered ── */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/80 backdrop-blur-sm px-3 py-2 shadow-sm">
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
            {PERIOD_CONFIG.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriodFilter(p.value)}
                className={cn(
                  "relative rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap z-10",
                  periodFilter === p.value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {periodFilter === p.value && (
                  <motion.div
                    layoutId="notif-period-pill"
                    className="absolute inset-0 rounded-md bg-primary"
                    style={{ zIndex: -1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                {p.label}
              </button>
            ))}
          </div>

          <div className="h-4 border-l border-border/50" />

          <div className="flex items-center gap-1">
            {CATEGORY_CONFIG.map((cat) => {
              const count = categoryCounts[cat.value];
              const isActive = categoryFilters.has(cat.value);
              return (
                <button
                  key={cat.value}
                  onClick={() => {
                    setCategoryFilters(prev => {
                      const next = new Set(prev);
                      if (next.has(cat.value)) next.delete(cat.value); else next.add(cat.value);
                      return next;
                    });
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <span className="text-[10px] leading-none">{cat.emoji}</span>
                  {cat.label}
                  <span className={cn("tabular-nums text-[10px]", isActive ? 'text-primary/70' : 'text-muted-foreground/50')}>{count}</span>
                </button>
              );
            })}
          </div>

          {(activeTab === 'assigned' || activeTab === 'resolved') && (
            <>
              <div className="h-4 border-l border-border/50" />
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    assignedFilter !== '__all__'
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}>
                    <Users className="h-3 w-3" />
                    {assignedFilter !== '__all__' ? assignedFilter : 'Responsável'}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1.5" align="start">
                  <button
                    onClick={() => setAssignedFilter('__all__')}
                    className={cn(
                      "w-full text-left rounded-md px-2.5 py-2 text-xs transition-colors",
                      assignedFilter === '__all__' ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted/50'
                    )}
                  >
                    Todos
                  </button>
                  {agents.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setAssignedFilter(a.name)}
                      className={cn(
                        "w-full text-left rounded-md px-2.5 py-2 text-xs transition-colors",
                        assignedFilter === a.name ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted/50'
                      )}
                    >
                      {a.name}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </>
          )}

          {activeFilterCount > 0 && (
            <>
              <div className="h-4 border-l border-border/50" />
              <button
                onClick={() => { setPeriodFilter('all'); setCategoryFilters(new Set()); setAssignedFilter('__all__'); }}
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/5 transition-colors"
              >
                <X className="h-3 w-3" />
                Limpar
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Section Label ── */}
      <div className="flex items-center gap-2 px-1 mb-2">
        <SectionIcon className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">{sectionLabel}</span>
        <span className="text-xs text-muted-foreground/60 tabular-nums">({filteredLeads.length})</span>
      </div>

      {/* ── Lead List ── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="text-3xl mb-2">📭</span>
          <p className="text-sm text-muted-foreground">Nenhuma notificação nesta aba</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLeads.map((lead) => (
            <LeadCardRow
              key={lead.id}
              lead={lead}
              agents={agents}
              isPreviewActive={selectedLead?.id === lead.id}
              onOpenConversa={() => openConversaAndAssign(lead)}
              onAssign={(name) => assignResponsible(lead._groupIds, name)}
              onEvaluationChange={(stage) => changeEvaluation(lead._groupIds, stage)}
              onResolve={() => resolveCard(lead._groupIds)}
              activeTab={activeTab}
              currentUserName={currentUserName}
            />
          ))}
        </div>
      )}

      {/* ── Chat Preview Modal ── */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex bg-black/70 backdrop-blur-sm" onClick={() => setSelectedLead(null)}>
          <div className="flex w-[95vw] h-[90vh] m-auto rounded-xl border border-border bg-background shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>

            {/* Filter sidebar — vertical */}
            <div className="w-[200px] shrink-0 border-r border-border/50 flex flex-col bg-muted/10 overflow-y-auto">
              {/* Modal tabs: Novos / Meus / Outros — larger text */}
              <div className="px-2 pt-2 pb-1.5">
                <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
                  {([
                    { key: 'novos' as ModalTabFilter, label: 'Novos', count: modalTabCounts.novos },
                    { key: 'meus' as ModalTabFilter, label: 'Meus', count: modalTabCounts.meus },
                    { key: 'outros' as ModalTabFilter, label: 'Outros', count: modalTabCounts.outros },
                  ]).map(t => (
                    <button
                      key={t.key}
                      onClick={() => setModalTab(t.key)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-semibold transition-all",
                        modalTab === t.key
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t.label}
                      <span className={cn(
                        "flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                        modalTab === t.key
                          ? t.count > 0 ? "bg-destructive text-white" : "bg-muted text-muted-foreground"
                          : t.count > 0 ? "bg-destructive/80 text-white" : "bg-muted/80 text-muted-foreground/60"
                      )}>
                        {t.count > 999 ? `${Math.floor(t.count / 1000)}K+` : t.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mx-2 border-t border-border/30" />

              {/* Category filters — vertical list */}
              <div className="px-2 pt-1.5 pb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1.5">Categoria</p>
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => setCategoryFilters(new Set())}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all text-left",
                      categoryFilters.size === 0
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                    )}
                  >
                    <span className="text-base">📋</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">Todos</p>
                      <p className={cn("text-[11px]", categoryFilters.size === 0 ? "text-primary/60" : "text-muted-foreground/50")}>{categoryCounts.all} leads</p>
                    </div>
                  </button>
                  {CATEGORY_CONFIG.map((cat) => {
                    const count = categoryCounts[cat.value];
                    const isActive = categoryFilters.has(cat.value);
                    return (
                      <button
                        key={cat.value}
                        onClick={() => {
                          setCategoryFilters(prev => {
                            const next = new Set(prev);
                            if (next.has(cat.value)) next.delete(cat.value); else next.add(cat.value);
                            return next;
                          });
                        }}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all text-left border",
                          isActive
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent"
                        )}
                      >
                        <span className="text-base">{cat.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight">{cat.label}</p>
                          <p className={cn("text-[11px]", isActive ? "text-primary/60" : "text-muted-foreground/50")}>{count} leads</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mx-2 border-t border-border/30" />

              {/* Filter button to reveal date */}
              <div className="px-2 pt-1.5 pb-2">
                <button
                  onClick={() => setShowDateFilter(v => !v)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all text-left w-full",
                    showDateFilter ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtros
                  {periodFilter !== 'today' && (
                    <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] text-white font-bold">1</span>
                  )}
                </button>
                <AnimatePresence>
                  {showDateFilter && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-2 flex flex-col gap-0.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1 px-1">Período</p>
                        {PERIOD_CONFIG.map(p => (
                          <button
                            key={p.value}
                            onClick={() => setPeriodFilter(p.value)}
                            className={cn(
                              "rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all text-left",
                              periodFilter === p.value
                                ? "text-white shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                            style={periodFilter === p.value ? { background: 'linear-gradient(135deg, #76bd69, #00BC33)' } : undefined}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Sort indicator */}
                <div className="flex items-center gap-1.5 mt-1.5 px-1 text-[11px] text-muted-foreground/50">
                  <Clock className="h-3 w-3" />
                  Mais recente primeiro
                </div>
              </div>
            </div>

            {/* Lead list sidebar */}
            <div className="w-[380px] shrink-0 border-r border-border flex flex-col overflow-hidden bg-card">
              {/* Pulsing counter header */}
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center h-10 w-10 shrink-0">
                    <span className={cn("absolute inset-0 rounded-full opacity-20 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]", heroBgColor)} />
                    <span className={cn("absolute inset-1 rounded-full opacity-30", heroBgColor)} />
                    <span className={cn("relative z-10 flex items-center justify-center h-7 w-7 rounded-full text-white text-xs font-bold", heroBgColor)}>
                      {modalFilteredLeads.length}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {modalFilteredLeads.length} contato{modalFilteredLeads.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {modalTab === 'novos' ? 'Novos' : modalTab === 'meus' ? 'Meus' : 'Outros'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Lead list */}
              <div className="flex-1 overflow-y-auto">
                {modalFilteredLeads.map((lead) => {
                  const leadName = lead.user_name || lead.user_number || 'Sem nome';
                  const isSelected = selectedLead?.id === lead.id;
                  const leadTimeAgo = formatDistanceToNow(new Date(lead.horario_notificacao || lead.created_at), { addSuffix: false, locale: ptBR });
                  const leadEmoji = getStatusEmoji(lead.external_status);
                  const leadGroupCount = (lead as any)._groupCount || 1;
                  const leadPriorityBorder = getLeadPriorityBorder(lead.external_status);

                  return (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={cn(
                        "cursor-pointer border-b border-border/30 transition-all border-l-[3px]",
                        leadPriorityBorder,
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/20'
                      )}
                    >
                      <div className="px-3 py-3 flex items-center gap-3">
                        {/* Emoji circle */}
                        <div className="relative flex items-center justify-center h-10 w-10 shrink-0">
                          <span className={cn("absolute inset-0 rounded-full opacity-15", getStatusDot(lead.external_status))} />
                          <span className={cn("absolute inset-1 rounded-full opacity-25", getStatusDot(lead.external_status))} />
                          <span className="relative text-base z-10">{leadEmoji}</span>
                          {leadGroupCount > 1 && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground shadow z-20">
                              {leadGroupCount}
                            </span>
                          )}
                        </div>

                        {/* Status + name + info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate leading-tight">
                            {lead.external_status || 'Sem status'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">{leadName}</p>
                            {lead.agente && (
                              <>
                                <span className="text-muted-foreground/30">·</span>
                                <span className="text-[11px] text-muted-foreground/50 truncate max-w-[80px]">{lead.agente}</span>
                              </>
                            )}
                            <span className="text-muted-foreground/30">·</span>
                            <span className="text-[10px] text-muted-foreground/40 whitespace-nowrap">há {leadTimeAgo}</span>
                          </div>
                        </div>

                        {/* Abrir + Atribuir button */}
                        {!lead.assigned_to && currentUserName ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); openConversaAndAssign(lead); }}
                            className="shrink-0 h-8 px-3 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 hover:border-primary"
                          >
                            <Zap className="h-3.5 w-3.5" />
                            Abrir + Atribuir
                          </button>
                        ) : lead.assigned_to ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground/60 bg-muted/50 rounded-full px-2 py-0.5">
                            👤 {lead.assigned_to}
                          </span>
                        ) : null}

                        {/* Chevron for expand */}
                        <ModalLeadChevron lead={lead} agents={agents} selectedLead={selectedLead} onAssign={(ids, name) => assignResponsible(ids, name)} onEvaluationChange={(ids, stage) => changeEvaluation(ids, stage)} currentUserName={currentUserName} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chat preview */}
            <div className="flex-1 flex flex-col relative">
              {/* Top bar with lead info + assign button */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/20 shrink-0">
                <span className="text-base">{getStatusEmoji(selectedLead.external_status)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{selectedLead.user_name || selectedLead.user_number || 'Sem nome'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{selectedLead.external_status || 'Sem status'} {selectedLead.user_number ? `· ${selectedLead.user_number}` : ''}</p>
                </div>
                {currentUserName && !selectedLead.assigned_to ? (
                  <button
                    onClick={() => openConversaAndAssign(selectedLead)}
                    className="shrink-0 h-9 px-4 rounded-full text-xs font-semibold flex items-center gap-2 transition-all text-white shadow-[0_0_20px_hsla(142,100%,37%,0.25)] hover:brightness-110 hover:-translate-y-px"
                    style={{ background: 'linear-gradient(135deg, #76bd69, #00BC33)' }}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Atribuir Atendimento
                  </button>
                ) : selectedLead.assigned_to ? (
                  <span className="shrink-0 text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1.5 flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-primary" />
                    {selectedLead.assigned_to}
                  </span>
                ) : null}
                <button onClick={() => setSelectedLead(null)}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Chat iframe */}
              <div className="flex-1 relative">
                {selectedLead.id_chat ? (
                  <iframe src={`https://advmidia.wts.chat/chat2/sessions/${selectedLead.id_chat}/preview`} className="w-full h-full border-0" title="Chat Preview" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                    <MessageCircle className="h-10 w-10 opacity-20" />
                    <span className="text-sm font-medium">Nenhum chat disponível</span>
                    <p className="text-xs text-muted-foreground/60 max-w-[280px] text-center">
                      O chat deste lead ainda não foi sincronizado. Clique abaixo para buscar os dados atualizados.
                    </p>
                    <button
                      onClick={() => syncSingleLead(selectedLead)}
                      disabled={syncing}
                      className="mt-2 h-10 px-5 rounded-full text-sm font-semibold flex items-center gap-2 transition-all text-white shadow-[0_0_20px_hsla(142,100%,37%,0.25)] hover:brightness-110 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: 'linear-gradient(135deg, #76bd69, #00BC33)' }}
                    >
                      <RotateCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                      {syncing ? 'Sincronizando...' : 'Sincronizar Lead'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Modal Lead Chevron (expand details inside modal) ──
function ModalLeadChevron({ lead, agents, selectedLead, onAssign, onEvaluationChange, currentUserName }: {
  lead: LeadCard & { _groupIds?: string[]; _groupCount?: number };
  agents: { id: string; name: string }[];
  selectedLead: any;
  onAssign: (ids: string[], name: string | null) => void;
  onEvaluationChange: (ids: string[], stage: string) => void;
  currentUserName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const groupIds = lead._groupIds || [lead.id];

  return (
    <div className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="p-1 rounded-md hover:bg-muted/50 transition-colors"
      >
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground/50 transition-transform", open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 w-56 rounded-lg border border-border bg-card shadow-lg p-2.5 space-y-2" onClick={(e) => e.stopPropagation()}>
          {lead.user_number && <p className="text-[11px] text-muted-foreground">📞 {lead.user_number}</p>}
          {lead.agente && <p className="text-[11px] text-muted-foreground">📋 Etapa: {lead.agente}</p>}
          <Select value={lead.assigned_to || 'unassigned'} onValueChange={(v) => onAssign(groupIds, v === 'unassigned' ? null : v)}>
            <SelectTrigger className="h-7 text-[11px] w-full rounded-md"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Não atribuído</SelectItem>
              {agents.map(a => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {(() => {
            const currentEval = lead.evaluation_stage || 'novo';
            const evalOption = EVALUATION_OPTIONS.find(o => o.value === currentEval);
            return (
              <Select value={currentEval} onValueChange={(v) => onEvaluationChange(groupIds, v)}>
                <SelectTrigger className={cn("h-7 text-[11px] w-full rounded-md font-medium", evalOption?.color || '')}>
                  <SelectValue placeholder="Avaliação" />
                </SelectTrigger>
                <SelectContent>
                  {EVALUATION_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className={cn("rounded px-1.5 py-0.5 text-xs", opt.color)}>{opt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}
          {lead.id_chat && (
            <a href={`https://advmidia.wts.chat/chat2/sessions/${lead.id_chat}`} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> Chat externo
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Card Row ──
interface LeadCardRowProps {
  lead: LeadCard & { _groupCount?: number; _groupIds?: string[]; _groupStatuses?: string; _timeline?: LeadCard[] };
  agents: { id: string; name: string }[];
  isPreviewActive: boolean;
  onOpenConversa: () => void;
  onAssign: (name: string | null) => void;
  onEvaluationChange: (stage: string) => void;
  onResolve: () => void;
  activeTab: TabFilter;
  currentUserName?: string | null;
}

function LeadCardRow({ lead, agents, isPreviewActive, onOpenConversa, onAssign, onEvaluationChange, activeTab, currentUserName }: LeadCardRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const timeAgo = formatDistanceToNow(new Date(lead.horario_notificacao || lead.created_at), { addSuffix: true, locale: ptBR });

  const name = lead.user_name || lead.user_number || 'Sem nome';
  const timeline = (lead as any)._timeline as LeadCard[] | undefined;
  const priorityBorder = getLeadPriorityBorder(lead.external_status);
  const groupCount = (lead._groupCount || 1);
  const statusDot = getStatusDot(lead.external_status);
  const emoji = getStatusEmoji(lead.external_status);

  return (
    <div className={cn(
      "rounded-lg border border-border/50 bg-card transition-all border-l-[3px] group overflow-hidden",
      expanded ? 'shadow-md' : 'hover:shadow-sm',
      isPreviewActive && 'ring-1 ring-primary/30 bg-primary/5',
      priorityBorder
    )}>
      {/* Main row */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
        onClick={() => onOpenConversa()}
      >
        {/* Pulsing status circle with emoji */}
        <div className="relative flex items-center justify-center h-9 w-9 shrink-0">
          <span className={cn("absolute inset-0 rounded-full opacity-20 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]", statusDot)} />
          <span className={cn("absolute inset-1 rounded-full opacity-30", statusDot)} />
          <span className="relative text-sm z-10">{emoji}</span>
          {groupCount > 1 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground shadow-sm z-20">
              {groupCount}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground truncate">
              {lead.external_status || 'Sem status'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-xs text-muted-foreground truncate">{name}</p>
            {lead.agente && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-[11px] text-muted-foreground/60 truncate">{lead.agente}</span>
              </>
            )}
            <span className="text-muted-foreground/40">·</span>
            <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">{timeAgo}</span>
          </div>
        </div>

        {/* Quick action: Abrir Conversa + Atribuir */}
        {!lead.assigned_to && currentUserName && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenConversa(); }}
            className={cn(
              "shrink-0 h-7 px-2.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all",
              "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 hover:border-primary"
            )}
            title="Abrir conversa e atribuir a mim"
          >
            <Zap className="h-3 w-3" />
            Abrir + Atribuir
          </button>
        )}

        {/* Chevron to expand options */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          className="shrink-0 p-1 rounded-md hover:bg-muted/50 transition-colors"
        >
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground/50 transition-transform", expanded && 'rotate-180')} />
        </button>
      </div>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/30 overflow-hidden"
          >
            <div className="px-4 py-3 space-y-3">
              {/* Actions row */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Responsible */}
                <div className="w-40" onClick={(e) => e.stopPropagation()}>
                  <Select value={lead.assigned_to || 'unassigned'} onValueChange={(v) => onAssign(v === 'unassigned' ? null : v)}>
                    <SelectTrigger className="h-8 text-xs rounded-lg border-border/50">
                      <SelectValue placeholder="Responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Não atribuído</SelectItem>
                      {agents.map(a => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Evaluation */}
                <div className="w-36" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const currentEval = lead.evaluation_stage || 'novo';
                    const evalOption = EVALUATION_OPTIONS.find(o => o.value === currentEval);
                    return (
                      <Select value={currentEval} onValueChange={(v) => onEvaluationChange(v)}>
                        <SelectTrigger className={cn("h-8 text-xs rounded-lg font-medium", evalOption?.color || '')}>
                          <SelectValue placeholder="Avaliação" />
                        </SelectTrigger>
                        <SelectContent>
                          {EVALUATION_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <span className={cn("rounded px-1.5 py-0.5 text-xs", opt.color)}>{opt.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </div>

                {/* Open chat externally */}
                {lead.id_chat && (
                  <a href={`https://advmidia.wts.chat/chat2/sessions/${lead.id_chat}`} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 px-3 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
                    <ExternalLink className="h-3 w-3" /> Chat externo
                  </a>
                )}

                {/* Timeline toggle */}
                {timeline && timeline.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); setShowTimeline(v => !v); }}
                    className="h-8 px-3 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Linha do tempo ({timeline.length})
                    {showTimeline ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
              </div>

              {/* Lead details */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                {lead.user_number && (
                  <span className="flex items-center gap-1">📞 {lead.user_number}</span>
                )}
                {lead.assigned_to && (
                  <span className="flex items-center gap-1">👤 {lead.assigned_to}</span>
                )}
              </div>

              {/* Timeline */}
              {showTimeline && timeline && timeline.length > 1 && (
                <div className="rounded-lg bg-muted/20 p-3">
                  <div className="relative pl-4">
                    {timeline.map((item, idx) => {
                      const isLast = idx === timeline.length - 1;
                      const itemDate = new Date(item.horario_notificacao || item.created_at);
                      const dotColor = idx === 0 ? 'bg-primary' : 'bg-muted-foreground/30';
                      return (
                        <div key={item.id} className="flex items-start gap-3 relative pb-3 last:pb-0">
                          {!isLast && <div className="absolute left-[5px] top-3.5 w-px h-[calc(100%-6px)] bg-border/50" />}
                          <div className={cn("relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full", dotColor)} />
                          <div className="flex-1 min-w-0 flex items-baseline gap-2">
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", getStatusDot(item.external_status))} />
                            <p className="text-xs font-medium text-foreground truncate">{item.external_status || 'Desconhecido'}</p>
                            <p className="text-[11px] text-muted-foreground/60 whitespace-nowrap">
                              {format(itemDate, "dd/MM HH:mm", { locale: ptBR })}
                            </p>
                            {item.agente && <p className="text-[11px] text-muted-foreground/60 truncate">· {item.agente}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default NotificationsPage;
