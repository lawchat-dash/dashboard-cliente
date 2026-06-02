import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw, Play, Moon, Unlock, Database, Users, MessageSquare,
  Clock, Activity, Server, Zap, ScrollText, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import AnimatedCounter from '@/components/AnimatedCounter';

interface Stats {
  clients: number; cards: number; sessions: number;
  db: string; cronHourly: boolean; cronNightly: boolean; events: number;
}

interface LogEvent { id: number; type: string; ts: number; path?: string; message?: string; name?: string; status?: number; }

const AdminSync = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const sinceRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  // Carrega status (health + clients + cron)
  const loadStatus = useCallback(async () => {
    try {
      const [health, clients, cron] = await Promise.all([
        fetch('/api/health').then(r => r.json()).catch(() => ({})),
        fetch('/api/clients').then(r => r.json()).catch(() => ({ clients: [] })),
        fetch('/api/cron/status').then(r => r.json()).catch(() => ({})),
      ]);
      const list = clients.clients || [];
      const cards = list.reduce((a: number, c: any) => a + parseInt(c.cards_count || 0), 0);
      const sessions = list.reduce((a: number, c: any) => a + parseInt(c.sessions_count || 0), 0);
      setStats({
        clients: list.length,
        cards, sessions,
        db: health.db === 'ok' ? 'OK · ' + (health.db_name || 'postgres') : 'erro',
        cronHourly: cron.hourly?.enabled ?? false,
        cronNightly: cron.nightly?.enabled ?? false,
        events: events.length,
      });
    } catch {}
  }, [events.length]);

  // Polling de eventos
  const pollEvents = useCallback(async () => {
    try {
      const r = await fetch(`/api/events?since=${sinceRef.current}`).then(x => x.json());
      if (r.events?.length) {
        setEvents(prev => [...prev, ...r.events].slice(-200));
        sinceRef.current = r.events[r.events.length - 1].id;
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadStatus();
    pollEvents();
    const s = setInterval(loadStatus, 8000);
    const e = setInterval(pollEvents, 2500);
    return () => { clearInterval(s); clearInterval(e); };
  }, [loadStatus, pollEvents]);

  const action = async (key: string, url: string, body?: any, label?: string) => {
    setBusy(key);
    try {
      const opts: RequestInit = body
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : { method: 'POST' };
      const r = await fetch(url, opts);
      if (r.ok || r.status === 200) toast.success(`${label || 'Ação'} executada`);
      else toast.error(`Falha: HTTP ${r.status}`);
      setTimeout(() => { loadStatus(); pollEvents(); }, 1500);
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    } finally {
      setTimeout(() => setBusy(null), 1200);
    }
  };

  const statCards = [
    { label: 'Clientes', value: stats?.clients ?? 0, sub: 'ativos', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Cards Sincronizados', value: stats?.cards ?? 0, sub: 'no banco', icon: Database, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Sessions', value: stats?.sessions ?? 0, sub: 'conversas', icon: MessageSquare, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  ];

  const healthItems = [
    { label: 'Banco', value: stats?.db || '...', icon: Database, ok: stats?.db?.startsWith('OK') },
    { label: 'Cron Horário', value: stats?.cronHourly ? 'Ligado' : 'Desligado', icon: Clock, ok: stats?.cronHourly },
    { label: 'Cron Noturno', value: stats?.cronNightly ? 'Ligado' : 'Desligado', icon: Moon, ok: stats?.cronNightly },
    { label: 'Server', value: 'localhost:8787', icon: Server, ok: true },
    { label: 'Eventos', value: String(events.length), icon: Zap, ok: true },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#8ED393] to-[#15BF41] text-white shadow-sm">
              <RefreshCw className="h-[18px] w-[18px]" />
            </span>
            Central de Sincronização
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Cron, sync, logs e diagnósticos
            </span>
          </p>
        </div>
        <button
          onClick={() => { loadStatus(); pollEvents(); toast.success('Atualizado'); }}
          className="btn-lawchat inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
        >
          <RefreshCw className="relative z-10 h-4 w-4" />
          <span className="relative z-10">Atualizar</span>
        </button>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.bg}`}>
                <c.icon className={`h-[18px] w-[18px] ${c.color}`} />
              </div>
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              <AnimatedCounter value={c.value} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Saúde do sistema */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Saúde do Sistema</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {healthItems.map(h => (
            <div key={h.label} className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <h.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {h.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                <span className="text-sm font-medium text-foreground truncate">{h.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Ações Rápidas</h3>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ActionBtn busy={busy === 'cronH'} onClick={() => action('cronH', '/api/cron/hourly/run-now', undefined, 'Cron horário')} icon={Play} grad="from-blue-500 to-blue-600" label="Cron Horário Agora" />
          <ActionBtn busy={busy === 'cronN'} onClick={() => action('cronN', '/api/cron/nightly/run-now', undefined, 'Cron noturno')} icon={Moon} grad="from-violet-500 to-purple-600" label="Cron Noturno Agora" />
          <ActionBtn busy={busy === 'lock'} onClick={() => action('lock', '/api/sync-cancel', { clientId: 'all' }, 'Limpar locks')} icon={Unlock} grad="from-orange-500 to-amber-600" label="Limpar Locks" />
        </div>
      </div>

      {/* Logs ao vivo */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-[0_1px_3px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Logs ao Vivo</h3>
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> {events.length} eventos
            </span>
          </div>
        </div>
        <div ref={logRef} className="max-h-80 overflow-y-auto bg-slate-950 px-4 py-3 font-mono text-xs">
          {events.length === 0 && <p className="text-slate-500 py-4 text-center">Aguardando eventos...</p>}
          {events.slice(-100).map((e) => (
            <div key={e.id} className="flex gap-2 py-0.5 leading-relaxed">
              <span className="text-slate-600 shrink-0">{new Date(e.ts).toLocaleTimeString('pt-BR')}</span>
              <span className={`shrink-0 ${
                e.type === 'helena_request' ? 'text-cyan-400' :
                e.type === 'client_sync_start' || e.type === 'priority_sync_start' ? 'text-emerald-400' :
                e.type.includes('error') ? 'text-red-400' : 'text-amber-400'
              }`}>[{e.type}]</span>
              <span className="text-slate-300 truncate">
                {e.path?.substring(0, 90) || e.message || e.name || (e.status ? `status ${e.status}` : '')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Atalho painel HTML legado */}
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Precisa do painel HTML completo (Histórico, config avançada)?
        </p>
        <a href="/sync" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">
          Abrir painel legado /sync ↗
        </a>
      </div>
    </div>
  );
};

const ActionBtn = ({ busy, onClick, icon: Icon, grad, label }: any) => (
  <button
    onClick={onClick}
    disabled={busy}
    className={`group relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r ${grad} px-4 text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:translate-y-0`}
  >
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
    <span>{label}</span>
    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
  </button>
);

export default AdminSync;
