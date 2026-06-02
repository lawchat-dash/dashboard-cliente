import { Filters } from '@/hooks/useFilters';
import { FUNNEL_STEPS, getStepDisplayName } from '@/utils/normalizeStep';
import { CalendarIcon, Filter, RefreshCw, X, Search, Tag, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { Session } from '@/api/helena';
import { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { format, parse, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';

interface FiltersBarProps {
  filters: Filters;
  setFilters: (f: Filters | ((prev: Filters) => Filters)) => void;
  clearFilters: () => void;
  uniqueResponsibles: string[];
  uniqueChannelNumbers: string[];
  uniqueTags: { id: string; name: string }[];
  uniqueLeadSources: string[];
  sessions: Session[];
  onRefresh: () => void;
  isRefreshing: boolean;
  panelOptions: { id: string; name: string }[];
  defaultCollapsed?: boolean;
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

type QuickPeriod = 'today' | 'yesterday' | 'today_yesterday' | '7d' | '14d' | '28d' | '30d' | 'this_week' | 'last_week' | 'month' | 'last_month' | 'all';

const INLINE_PERIODS: { key: QuickPeriod; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'month', label: 'Este mês' },
];

const MORE_PERIODS: { key: QuickPeriod; label: string }[] = [
  { key: 'today_yesterday', label: 'Hoje e ontem' },
  { key: '14d', label: 'Últimos 14 dias' },
  { key: '28d', label: 'Últimos 28 dias' },
  { key: 'this_week', label: 'Esta Semana' },
  { key: 'last_week', label: 'Semana Passada' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'all', label: 'Todo Período' },
];

const ALL_PERIODS = [...INLINE_PERIODS, ...MORE_PERIODS];

function getQuickDates(key: QuickPeriod): { start: string; end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = toDateStr(today);

  switch (key) {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'yesterday': {
      const y = toDateStr(new Date(today.getTime() - 86400000));
      return { start: y, end: y };
    }
    case 'today_yesterday':
      return { start: toDateStr(new Date(today.getTime() - 86400000)), end: todayStr };
    case '7d':
      return { start: toDateStr(new Date(today.getTime() - 6 * 86400000)), end: todayStr };
    case '14d':
      return { start: toDateStr(new Date(today.getTime() - 13 * 86400000)), end: todayStr };
    case '28d':
      return { start: toDateStr(new Date(today.getTime() - 27 * 86400000)), end: todayStr };
    case '30d':
      return { start: toDateStr(new Date(today.getTime() - 29 * 86400000)), end: todayStr };
    case 'this_week': {
      const start = startOfWeek(today, { weekStartsOn: 1 });
      return { start: toDateStr(start), end: todayStr };
    }
    case 'last_week': {
      const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
      return { start: toDateStr(lastWeekStart), end: toDateStr(lastWeekEnd) };
    }
    case 'month':
      return { start: toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)), end: todayStr };
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toDateStr(start), end: toDateStr(end) };
    }
    case 'all':
      return { start: '', end: '' };
  }
}

function strToDate(s: string): Date | undefined {
  if (!s) return undefined;
  return parse(s, 'yyyy-MM-dd', new Date());
}

function dateToStr(d: Date | undefined): string {
  if (!d) return '';
  return toDateStr(d);
}

const FilterGroup = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={cn("flex flex-col gap-1 min-w-0", className)}>
    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
    <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
  </div>
);

const StepMultiSelect = ({ steps, onChange, inputClass }: { steps: string[]; onChange: (s: string[]) => void; inputClass: string }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (step: string) => {
    onChange(steps.includes(step) ? steps.filter(s => s !== step) : [...steps, step]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(inputClass, "flex items-center gap-1.5 cursor-pointer", steps.length > 0 && "border-primary/50")}
      >
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        {steps.length > 0 ? `${steps.length} etapa(s)` : 'Todas etapas'}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-lg border border-border bg-popover p-2 shadow-lg">
          <div className="space-y-0.5">
            <button
              onClick={() => onChange([])}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors font-medium",
                steps.length === 0 ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
              )}
            >
              Todas as etapas
            </button>
            <div className="my-1 border-t border-border" />
            {FUNNEL_STEPS.map(step => (
              <button
                key={step}
                onClick={() => toggle(step)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
                  steps.includes(step) ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted"
                )}
              >
                <div className={cn(
                  "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                  steps.includes(step) ? "bg-primary border-primary text-primary-foreground" : "border-border"
                )}>
                  {steps.includes(step) && <span className="text-[9px]">✓</span>}
                </div>
                <span className="truncate">{getStepDisplayName(step)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const PanelMultiSelect = ({ options, values, onChange, inputClass }: { options: { id: string; name: string }[]; values: string[]; onChange: (v: string[]) => void; inputClass: string }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (b) setPos({ top: b.bottom + 4, left: b.left, width: Math.max(b.width, 240) });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove); };
  }, [open]);

  const real = options.filter(o => o.id !== '__all__');
  const toggle = (id: string) => onChange(values.includes(id) ? values.filter(v => v !== id) : [...values, id]);
  const label = values.length === 0 ? 'Todos os Painéis' : `${values.length} painel(is)`;

  return (
    <>
      <button ref={btnRef} onClick={() => setOpen(o => !o)} className={cn(inputClass, "flex items-center gap-1.5 cursor-pointer min-w-[180px] justify-between", values.length > 0 && "border-primary/50")}>
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>
      {/* Portal no body + position:fixed + z altíssimo → sempre por cima dos cards,
          imune a contexto de empilhamento (era o bug do "Cards Totais" vazando). */}
      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-2xl"
        >
          <button onClick={() => onChange([])} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left font-medium transition-colors", values.length === 0 ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}>
            Todos os Painéis
          </button>
          <div className="my-1 border-t border-border" />
          {real.map(p => (
            <button key={p.id} onClick={() => toggle(p.id)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors", values.includes(p.id) ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted")}>
              <div className={cn("h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0", values.includes(p.id) ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                {values.includes(p.id) && <span className="text-[9px]">✓</span>}
              </div>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>, document.body)}
    </>
  );
};

const ChannelMultiSelect = ({ values, options, onChange, inputClass, fullWidth }: { values: string[]; options: string[]; onChange: (v: string[]) => void; inputClass: string; fullWidth?: boolean }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (n: string) => {
    onChange(values.includes(n) ? values.filter(v => v !== n) : [...values, n]);
  };

  const label = values.length === 0
    ? 'Todos números'
    : values.length === 1
      ? values[0]
      : `${values.length} números`;

  return (
    <div className={cn("relative", fullWidth && "w-full")} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(inputClass, "flex items-center gap-1.5 cursor-pointer", fullWidth && "w-full justify-between", values.length > 0 && "border-primary/50")}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-lg border border-border bg-popover p-2 shadow-lg">
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            <button
              onClick={() => onChange([])}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors font-medium",
                values.length === 0 ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
              )}
            >
              Todos os números
            </button>
            {options.length > 0 && <div className="my-1 border-t border-border" />}
            {options.map(n => (
              <button
                key={n}
                onClick={() => toggle(n)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
                  values.includes(n) ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted"
                )}
              >
                <div className={cn(
                  "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                  values.includes(n) ? "bg-primary border-primary text-primary-foreground" : "border-border"
                )}>
                  {values.includes(n) && <span className="text-[9px]">✓</span>}
                </div>
                <span className="truncate">{n}</span>
              </button>
            ))}
            {options.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum número disponível</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CampaignDropdown = ({ sessions, filters, setFilters, inputClass }: { sessions: Session[]; filters: Filters; setFilters: (f: Filters | ((prev: Filters) => Filters)) => void; inputClass: string }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const campaigns = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach(s => {
      if (s.utmCampaign) {
        map.set(s.utmCampaign, (map.get(s.utmCampaign) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [sessions]);

  const totalWithUtm = useMemo(() => sessions.filter(s => s.utmCampaign).length, [sessions]);

  const filtered = useMemo(() => {
    if (!search) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter(c => c.name.toLowerCase().includes(q));
  }, [campaigns, search]);

  const label = filters.campaign === '__all__' ? 'Todas campanhas' : filters.campaign;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(inputClass, "flex items-center gap-1.5 cursor-pointer max-w-[220px]", filters.campaign !== '__all__' && "border-primary/50")}
      >
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-[320px] rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar campanha..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto p-1">
            <button
              onClick={() => { setFilters(f => ({ ...f, campaign: '__all__' })); setOpen(false); setSearch(''); }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                filters.campaign === '__all__' ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted/40'
              )}
            >
              Todas as Campanhas
              <span className="text-xs tabular-nums text-muted-foreground">{totalWithUtm} leads</span>
            </button>
            {filtered.map(c => (
              <button
                key={c.name}
                onClick={() => { setFilters(f => ({ ...f, campaign: c.name })); setOpen(false); setSearch(''); }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                  filters.campaign === c.name ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted/40'
                )}
              >
                <span className="truncate mr-2">{c.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c.count} leads</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhuma campanha encontrada</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Mobile Filters Content (reused inside Sheet) ─── */
const MobileFiltersContent = ({
  filters, setFilters, clearFilters, uniqueResponsibles, uniqueChannelNumbers,
  uniqueTags, uniqueLeadSources, sessions, onRefresh, isRefreshing, panelOptions,
}: FiltersBarProps) => {
  const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const [tagSearch, setTagSearch] = useState('');

  const activePeriod = useMemo<QuickPeriod | null>(() => {
    for (const p of ALL_PERIODS) {
      const { start, end } = getQuickDates(p.key);
      if (filters.dateStart === start && filters.dateEnd === end) return p.key;
    }
    return null;
  }, [filters.dateStart, filters.dateEnd]);

  const handleQuickPeriod = (key: QuickPeriod) => {
    const { start, end } = getQuickDates(key);
    setFilters(f => ({ ...f, dateStart: start, dateEnd: end }));
  };

  const filteredTags = useMemo(() => {
    if (!tagSearch) return uniqueTags;
    const q = tagSearch.toLowerCase();
    return uniqueTags.filter(t => t.name.toLowerCase().includes(q));
  }, [uniqueTags, tagSearch]);

  const toggleTag = (tagId: string) => {
    setFilters(f => ({
      ...f,
      tags: f.tags.includes(tagId) ? f.tags.filter(t => t !== tagId) : [...f.tags, tagId],
    }));
  };

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      {/* Period */}
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Período</span>
        <div className="grid grid-cols-3 gap-1.5">
          {ALL_PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => handleQuickPeriod(p.key)}
              className={cn(
                "h-9 rounded-md px-2 text-xs font-medium transition-colors",
                activePeriod === p.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background text-muted-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode */}
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Modo</span>
        <div className="flex gap-2">
          <button
            onClick={() => setFilters(f => ({ ...f, dateMode: 'creation' as const }))}
            className={cn(
              "flex-1 h-9 rounded-md text-xs font-medium transition-colors",
              filters.dateMode === 'creation' ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            )}
          >
            Criação
          </button>
          <button
            onClick={() => setFilters(f => ({ ...f, dateMode: 'update' as const }))}
            className={cn(
              "flex-1 h-9 rounded-md text-xs font-medium transition-colors",
              filters.dateMode === 'update' ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            )}
          >
            Atualização
          </button>
        </div>
      </div>

      {/* Campaign */}
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Campanha</span>
        <CampaignDropdown sessions={sessions} filters={filters} setFilters={setFilters} inputClass={inputClass} />
      </div>

      {/* Panel CRM */}
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Painel CRM</span>
        <PanelMultiSelect
          options={panelOptions}
          values={filters.panelIds || []}
          onChange={(v) => setFilters(f => ({ ...f, panelIds: v, panelId: '__all__' }))}
          inputClass={cn(inputClass, "w-full")}
        />
      </div>

      {/* Etapa */}
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Etapa</span>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setFilters(f => ({ ...f, steps: [] }))}
            className={cn(
              "h-9 rounded-md text-xs font-medium transition-colors",
              filters.steps.length === 0 ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            )}
          >
            Todas
          </button>
          {FUNNEL_STEPS.map(step => (
            <button
              key={step}
              onClick={() => {
                const steps = filters.steps.includes(step)
                  ? filters.steps.filter(s => s !== step)
                  : [...filters.steps, step];
                setFilters(f => ({ ...f, steps }));
              }}
              className={cn(
                "h-9 rounded-md px-2 text-xs font-medium transition-colors truncate",
                filters.steps.includes(step) ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
              )}
            >
              {getStepDisplayName(step)}
            </button>
          ))}
        </div>
      </div>

      {/* Responsável */}
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Responsável</span>
        <select
          value={filters.responsible[0] || ''}
          onChange={e => setFilters(f => ({ ...f, responsible: e.target.value ? [e.target.value] : [] }))}
          className={inputClass}
        >
          <option value="">Todos responsáveis</option>
          {uniqueResponsibles.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Número + Origem side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Número</span>
          <ChannelMultiSelect
            values={filters.channelNumbers}
            options={uniqueChannelNumbers}
            onChange={(channelNumbers) => setFilters(f => ({ ...f, channelNumbers }))}
            inputClass={inputClass}
            fullWidth
          />
        </div>
        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Origem</span>
          <select
            value={filters.leadSource}
            onChange={e => setFilters(f => ({ ...f, leadSource: e.target.value }))}
            className={inputClass}
          >
            <option value="">Todas</option>
            {uniqueLeadSources.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tags</span>
        <div className="rounded-md border border-border p-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Pesquisar tag..."
              value={tagSearch}
              onChange={e => setTagSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm"
            />
          </div>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filteredTags.map(tag => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
                  filters.tags.includes(tag.id) ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted"
                )}
              >
                <div className={cn(
                  "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                  filters.tags.includes(tag.id) ? "bg-primary border-primary text-primary-foreground" : "border-border"
                )}>
                  {filters.tags.includes(tag.id) && <span className="text-[9px]">✓</span>}
                </div>
                <span className="truncate">{tag.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <button
          onClick={clearFilters}
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-md border border-red-200 bg-background text-sm text-red-500"
        >
          <X className="h-3.5 w-3.5" /> Limpar
        </button>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>
    </div>
  );
};

/* ─── Main Component ─── */
const FiltersBar = (props: FiltersBarProps) => {
  const { filters, setFilters, clearFilters, onRefresh, isRefreshing, sessions, panelOptions, uniqueResponsibles, uniqueChannelNumbers, uniqueTags, uniqueLeadSources } = props;
  const isMobile = useIsMobile();
  const inputClass = "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  const [tagSearch, setTagSearch] = useState('');
  const [tagOpen, setTagOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(props.defaultCollapsed ?? false);
  const tagRef = useRef<HTMLDivElement>(null);

  // Ao trocar de aba: minimiza fora do dashboard, abre no dashboard.
  useEffect(() => { setCollapsed(props.defaultCollapsed ?? false); }, [props.defaultCollapsed]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) setTagOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activePeriod = useMemo<QuickPeriod | null>(() => {
    for (const p of ALL_PERIODS) {
      const { start, end } = getQuickDates(p.key);
      if (filters.dateStart === start && filters.dateEnd === end) return p.key;
    }
    return null;
  }, [filters.dateStart, filters.dateEnd]);

  const isMorePeriodActive = useMemo(() => {
    return activePeriod && MORE_PERIODS.some(p => p.key === activePeriod);
  }, [activePeriod]);

  const morePeriodLabel = useMemo(() => {
    if (isMorePeriodActive) {
      return MORE_PERIODS.find(p => p.key === activePeriod)?.label || 'Mais';
    }
    return 'Mais';
  }, [isMorePeriodActive, activePeriod]);

  const handleQuickPeriod = (key: QuickPeriod) => {
    const { start, end } = getQuickDates(key);
    setFilters(f => ({ ...f, dateStart: start, dateEnd: end }));
  };

  const isCustomDate = useMemo(() => {
    if (!filters.dateStart && !filters.dateEnd) return false;
    return !activePeriod;
  }, [filters.dateStart, filters.dateEnd, activePeriod]);

  const filteredTags = useMemo(() => {
    if (!tagSearch) return uniqueTags;
    const q = tagSearch.toLowerCase();
    return uniqueTags.filter(t => t.name.toLowerCase().includes(q));
  }, [uniqueTags, tagSearch]);

  const toggleTag = (tagId: string) => {
    setFilters(f => ({
      ...f,
      tags: f.tags.includes(tagId) ? f.tags.filter(t => t !== tagId) : [...f.tags, tagId],
    }));
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if ((filters.steps?.length ?? 0) > 0) count++;
    if ((filters.responsible?.length ?? 0) > 0) count++;
    if ((filters.channelNumbers?.length ?? 0) > 0) count++;
    if (filters.leadSource) count++;
    if ((filters.tags?.length ?? 0) > 0) count++;
    if (filters.campaign !== '__all__') count++;
    if ((filters.panelIds?.length ?? 0) > 0 || filters.panelId !== '__all__') count++;
    return count;
  }, [filters]);

  const activePeriodLabel = useMemo(() => {
    if (activePeriod) {
      return ALL_PERIODS.find(p => p.key === activePeriod)?.label || '';
    }
    if (isCustomDate) {
      const start = filters.dateStart ? format(strToDate(filters.dateStart)!, 'dd/MM') : '';
      const end = filters.dateEnd ? format(strToDate(filters.dateEnd)!, 'dd/MM') : '';
      return `${start} → ${end}`;
    }
    return 'Todo Período';
  }, [activePeriod, isCustomDate, filters.dateStart, filters.dateEnd]);

  // ─── MOBILE: Filter button → Sheet ───
  if (isMobile) {
    return (
      <div className="flex items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <button className="flex-1 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-card">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{activePeriodLabel}</span>
              {activeFilterCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0 rounded-t-2xl">
            <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Filter className="h-4 w-4 text-primary" />
                Filtros
              </SheetTitle>
            </SheetHeader>
            <MobileFiltersContent {...props} />
          </SheetContent>
        </Sheet>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    );
  }

  // ─── DESKTOP: original layout ───
  if (collapsed) {
    return (
      <div className="relative z-30 flex items-center gap-3 border-b border-border/40 px-0.5 pb-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{activePeriodLabel}</span>
        {filters.dateMode === 'update' && (
          <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Atualização</span>
        )}
        {activeFilterCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {activeFilterCount}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="btn-lawchat flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
          >
            <RefreshCw className={`relative z-10 h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="relative z-10">Atualizar</span>
          </button>
          <button
            onClick={() => setCollapsed(false)}
            className="flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Expandir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-30 space-y-3 border-b border-border/40 px-0.5 pb-4">
      {/* Row 1: Temporal filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Filter className="h-4 w-4 text-muted-foreground self-center mt-3" />

        <FilterGroup label="Período">
          <div className="relative flex items-center gap-1">
            {INLINE_PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => handleQuickPeriod(p.key)}
                className={cn(
                  "relative h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap z-10",
                  activePeriod === p.key
                    ? "text-primary-foreground"
                    : "border border-border bg-background text-muted-foreground hover:bg-secondary"
                )}
              >
                {activePeriod === p.key && (
                  <motion.div
                    layoutId="period-pill"
                    className="absolute inset-0 rounded-md"
                    style={{ zIndex: -1, background: 'linear-gradient(135deg, #8ED393, #15BF41)', boxShadow: '0 4px 10px -3px rgba(21,191,65,0.28)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                {p.label}
              </button>
            ))}

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-8 text-xs font-medium gap-1 relative z-10",
                    isMorePeriodActive && "text-primary-foreground border-transparent"
                  )}
                >
                  {isMorePeriodActive && (
                    <motion.div
                      layoutId="period-pill"
                      className="absolute inset-0 rounded-md"
                      style={{ zIndex: -1, background: 'linear-gradient(135deg, #8ED393, #15BF41)', boxShadow: '0 4px 10px -3px rgba(21,191,65,0.28)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {morePeriodLabel}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-2 space-y-0.5 min-w-[200px]">
                  {MORE_PERIODS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => handleQuickPeriod(p.key)}
                      className={cn(
                        "flex w-full items-center rounded-md px-3 py-2 text-sm text-left transition-colors",
                        activePeriod === p.key
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="border-t border-border p-3 space-y-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Intervalo personalizado</span>
                  <div className="flex gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">Data início</span>
                      <Calendar
                        mode="single"
                        selected={strToDate(filters.dateStart)}
                        onSelect={(d) => setFilters(f => ({ ...f, dateStart: dateToStr(d) }))}
                        className="p-2 pointer-events-auto rounded-md border border-border"
                        locale={ptBR}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">Data fim</span>
                      <Calendar
                        mode="single"
                        selected={strToDate(filters.dateEnd)}
                        onSelect={(d) => setFilters(f => ({ ...f, dateEnd: dateToStr(d) }))}
                        className="p-2 pointer-events-auto rounded-md border border-border"
                        locale={ptBR}
                      />
                    </div>
                  </div>
                  {isCustomDate && (
                    <div className="text-xs text-primary font-medium pt-1">
                      {filters.dateStart && format(strToDate(filters.dateStart)!, 'dd/MM/yyyy')}
                      {' → '}
                      {filters.dateEnd && format(strToDate(filters.dateEnd)!, 'dd/MM/yyyy')}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </FilterGroup>

        <div className="hidden sm:block h-8 border-l border-border self-end" />

        <FilterGroup label="Modo">
          <div className="relative flex items-center gap-1">
            <button
              onClick={() => setFilters(f => ({ ...f, dateMode: 'creation' as const }))}
              className={cn(
                "relative h-8 rounded-md px-2.5 text-xs font-medium transition-colors z-10",
                filters.dateMode === 'creation'
                  ? 'text-primary-foreground'
                  : 'border border-border bg-background text-muted-foreground hover:bg-secondary'
              )}
            >
              {filters.dateMode === 'creation' && (
                <motion.div
                  layoutId="mode-pill"
                  className="absolute inset-0 rounded-md"
                  style={{ zIndex: -1, background: 'linear-gradient(135deg, #8ED393, #15BF41)', boxShadow: '0 4px 10px -3px rgba(21,191,65,0.28)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              Criação
            </button>
            <button
              onClick={() => setFilters(f => ({ ...f, dateMode: 'update' as const }))}
              className={cn(
                "relative h-8 rounded-md px-2.5 text-xs font-medium transition-colors z-10",
                filters.dateMode === 'update'
                  ? 'text-primary-foreground'
                  : 'border border-border bg-background text-muted-foreground hover:bg-secondary'
              )}
            >
              {filters.dateMode === 'update' && (
                <motion.div
                  layoutId="mode-pill"
                  className="absolute inset-0 rounded-md"
                  style={{ zIndex: -1, background: 'linear-gradient(135deg, #8ED393, #15BF41)', boxShadow: '0 4px 10px -3px rgba(21,191,65,0.28)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              Atualização
            </button>
          </div>
        </FilterGroup>

        <div className="hidden sm:block h-8 border-l border-border self-end" />

        <FilterGroup label="Campanha">
          <CampaignDropdown sessions={sessions} filters={filters} setFilters={setFilters} inputClass={inputClass} />
        </FilterGroup>

        <div className="ml-auto self-end">
          <button
            onClick={() => setCollapsed(true)}
            className="flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            Minimizar
          </button>
        </div>
      </div>

      {/* Row 2: Data filters */}
      <div className="flex flex-wrap items-end gap-3 border-t border-border/50 pt-3">
        <FilterGroup label="Painel CRM">
          <PanelMultiSelect
            options={panelOptions}
            values={filters.panelIds || []}
            onChange={(v) => setFilters(f => ({ ...f, panelIds: v, panelId: '__all__' }))}
            inputClass={inputClass}
          />
        </FilterGroup>

        <div className="hidden sm:block h-8 border-l border-border self-end" />

        <FilterGroup label="Etapa">
          <StepMultiSelect
            steps={filters.steps}
            onChange={(steps) => setFilters(f => ({ ...f, steps }))}
            inputClass={inputClass}
          />
        </FilterGroup>

        <div className="hidden sm:block h-8 border-l border-border self-end" />

        <FilterGroup label="Responsável">
          <select
            value={filters.responsible[0] || ''}
            onChange={e => setFilters(f => ({ ...f, responsible: e.target.value ? [e.target.value] : [] }))}
            className={inputClass}
          >
            <option value="">Todos responsáveis</option>
            {uniqueResponsibles.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </FilterGroup>

        <div className="hidden sm:block h-8 border-l border-border self-end" />

        <FilterGroup label="Número">
          <ChannelMultiSelect
            values={filters.channelNumbers}
            options={uniqueChannelNumbers}
            onChange={(channelNumbers) => setFilters(f => ({ ...f, channelNumbers }))}
            inputClass={inputClass}
          />
        </FilterGroup>

        <div className="hidden sm:block h-8 border-l border-border self-end" />

        <FilterGroup label="Origem">
          <select
            value={filters.leadSource}
            onChange={e => setFilters(f => ({ ...f, leadSource: e.target.value }))}
            className={inputClass}
          >
            <option value="">Todas origens</option>
            {uniqueLeadSources.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </FilterGroup>

        <div className="hidden sm:block h-8 border-l border-border self-end" />

        <FilterGroup label="Tags">
          <div className="relative" ref={tagRef}>
            <button
              onClick={() => setTagOpen(!tagOpen)}
              className={cn(
                inputClass,
                "flex items-center gap-1.5 cursor-pointer",
                filters.tags.length > 0 && "border-primary/50"
              )}
            >
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {filters.tags.length > 0 ? `${filters.tags.length} tag(s)` : 'Tags'}
            </button>

            {tagOpen && (
              <div className="absolute top-full left-0 z-50 mt-1 w-72 rounded-lg border border-border bg-popover p-2 shadow-lg">
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Pesquisar tag..."
                    value={tagSearch}
                    onChange={e => setTagSearch(e.target.value)}
                    className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {filteredTags.length === 0 && (
                    <p className="py-3 text-center text-xs text-muted-foreground">Nenhuma tag encontrada</p>
                  )}
                  {filteredTags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
                        filters.tags.includes(tag.id)
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <div className={cn(
                        "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                        filters.tags.includes(tag.id)
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border"
                      )}>
                        {filters.tags.includes(tag.id) && <span className="text-[9px]">✓</span>}
                      </div>
                      <span className="truncate">{tag.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </FilterGroup>

        <div className="ml-auto flex items-end gap-2">
          <button
            onClick={clearFilters}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-destructive/30 bg-background px-3 text-sm text-destructive transition-all hover:bg-destructive/10 hover:border-destructive/50 hover:-translate-y-0.5"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </button>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="btn-lawchat flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold"
          >
            <RefreshCw className={`relative z-10 h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="relative z-10">Atualizar</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FiltersBar;
