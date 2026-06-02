import { useState, useEffect, useMemo } from 'react';
import { useClients, Client } from '@/hooks/useClient';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, RefreshCw, Loader2, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatPercent } from '@/utils/formatters';
import { toast } from 'sonner';

const LEVEL_CONFIG: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: 'Nível 1', color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-300' },
  2: { label: 'Nível 2', color: 'text-orange-700', bg: 'bg-orange-100 border-orange-300' },
  3: { label: 'Nível 3', color: 'text-red-700', bg: 'bg-red-100 border-red-300' },
};

interface CachedMetrics {
  client_id: string;
  period: string;
  total_leads: number;
  sdr: number;
  closer: number;
  contrato: number;
  assinatura: number;
  assinado: number;
  desqualificado: number;
  nao_assinou: number;
  conversion_rate: number;
  updated_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const AdminOverview = () => {
  const { clients, loading: loadingClients } = useClients();
  const [metricsCache, setMetricsCache] = useState<CachedMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadCache = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('client_metrics_cache')
      .select('*');
    if (error) {
      console.error('Error loading metrics cache:', error);
    } else {
      setMetricsCache(data as unknown as CachedMetrics[]);
      if (data && data.length > 0) {
        setLastUpdated(new Date((data as any)[0].updated_at));
      }
    }
    setLoading(false);
  };

  useEffect(() => { loadCache(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/refresh-metrics`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Refresh failed');
      await loadCache();
      toast.success('Métricas atualizadas!');
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const clientMetrics = useMemo(() => {
    return clients.map(client => {
      const cached = metricsCache.find(m => m.client_id === client.id && m.period === periodFilter);
      return {
        client,
        total: cached?.total_leads || 0,
        stages: {
          'SDR': cached?.sdr || 0,
          'CLOSER': cached?.closer || 0,
          'CONTRATO': cached?.contrato || 0,
          'ETAPA DE ASSINATURA': cached?.assinatura || 0,
          'CONTRATO FECHADO': cached?.assinado || 0,
          'DESQUALIFICADO': cached?.desqualificado || 0,
          'NAO ASSINOU': cached?.nao_assinou || 0,
        },
        conversionRate: cached?.conversion_rate || 0,
      };
    });
  }, [clients, metricsCache, periodFilter]);

  const filtered = useMemo(() => {
    let result = clientMetrics;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m => m.client.name.toLowerCase().includes(q));
    }
    if (levelFilter !== 'all') {
      result = result.filter(m => m.client.client_level === parseInt(levelFilter));
    }
    return result;
  }, [clientMetrics, search, levelFilter]);

  const totals = useMemo(() => {
    const t = { total: 0, stages: {} as Record<string, number> };
    const STAGE_KEYS = ['SDR', 'CLOSER', 'CONTRATO', 'ETAPA DE ASSINATURA', 'CONTRATO FECHADO', 'DESQUALIFICADO', 'NAO ASSINOU'];
    STAGE_KEYS.forEach(k => t.stages[k] = 0);
    filtered.forEach(m => {
      t.total += m.total;
      Object.entries(m.stages).forEach(([k, v]) => { t.stages[k] = (t.stages[k] || 0) + v; });
    });
    return t;
  }, [filtered]);

  const STAGE_DISPLAY = [
    { key: 'SDR', label: 'SDR', dot: 'bg-blue-500' },
    { key: 'CLOSER', label: 'Closer', dot: 'bg-green-500' },
    { key: 'CONTRATO', label: 'Confecção', dot: 'bg-orange-500' },
    { key: 'ETAPA DE ASSINATURA', label: 'Assinatura', dot: 'bg-amber-500' },
    { key: 'CONTRATO FECHADO', label: 'Assinado', dot: 'bg-emerald-500' },
    { key: 'DESQUALIFICADO', label: 'Desqual.', dot: 'bg-red-500' },
    { key: 'NAO ASSINOU', label: 'Não Assinou', dot: 'bg-pink-500' },
  ];

  if (loading || loadingClients) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando métricas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resumo Geral</h1>
          <p className="text-sm text-muted-foreground">Visão rápida de todos os clientes</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Atualizado: {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Atualizar agora
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground -mt-4">
        Os dados são calculados no servidor e atualizados a cada hora. Clique em "Atualizar agora" para forçar uma atualização.
      </p>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Total Clientes</p>
          <p className="text-2xl font-bold">{clients.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Total Leads</p>
          <p className="text-2xl font-bold">{totals.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Contratos Assinados</p>
          <p className="text-2xl font-bold text-emerald-600">{totals.stages['CONTRATO FECHADO'] || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Taxa Conversão Geral</p>
          <p className="text-2xl font-bold">{totals.total > 0 ? formatPercent((totals.stages['CONTRATO FECHADO'] || 0) / totals.total * 100) : '0%'}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-9" />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Nível" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="1">🟢 Nível 1</SelectItem>
            <SelectItem value="2">🟠 Nível 2</SelectItem>
            <SelectItem value="3">🔴 Nível 3</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Period pills */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-1">Período</span>
        {[
          { value: 'all', label: 'Todo Período' },
          { value: 'today', label: 'Hoje' },
          { value: '7d', label: '7 dias' },
          { value: '30d', label: '30 dias' },
        ].map(p => (
          <button
            key={p.value}
            onClick={() => setPeriodFilter(p.value)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium border transition-colors ${
              periodFilter === p.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Client metrics table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cliente</th>
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">Nível</th>
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">Leads</th>
                {STAGE_DISPLAY.map(s => (
                  <th key={s.key} className="px-3 py-3 text-center font-medium text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                      <span className="text-xs">{s.label}</span>
                    </div>
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => {
                const level = LEVEL_CONFIG[m.client.client_level] || LEVEL_CONFIG[1];
                return (
                  <motion.tr
                    key={m.client.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-border hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{m.client.name}</div>
                      <div className="text-xs text-muted-foreground">/d/{m.client.helena_company_id || m.client.slug}</div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge variant="outline" className={`text-xs ${level.bg} ${level.color} border`}>
                        {level.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-center font-semibold">{m.total}</td>
                    {STAGE_DISPLAY.map(s => {
                      const count = m.stages[s.key] || 0;
                      const pct = m.total > 0 ? (count / m.total * 100).toFixed(1) : '0.0';
                      return (
                        <td key={s.key} className="px-3 py-3 text-center">
                          <div className="font-medium">{count}</div>
                          <div className="text-[10px] text-muted-foreground">{pct}%</div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center">
                      <span className={`font-semibold ${m.conversionRate > 5 ? 'text-emerald-600' : m.conversionRate > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {formatPercent(m.conversionRate)}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
              {/* Totals row */}
              <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                <td className="px-4 py-3 text-foreground">Total ({filtered.length} clientes)</td>
                <td className="px-3 py-3" />
                <td className="px-3 py-3 text-center">{totals.total}</td>
                {STAGE_DISPLAY.map(s => (
                  <td key={s.key} className="px-3 py-3 text-center">
                    <div>{totals.stages[s.key] || 0}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      {totals.total > 0 ? ((totals.stages[s.key] || 0) / totals.total * 100).toFixed(1) : '0.0'}%
                    </div>
                  </td>
                ))}
                <td className="px-3 py-3 text-center">
                  {totals.total > 0 ? formatPercent((totals.stages['CONTRATO FECHADO'] || 0) / totals.total * 100) : '0%'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AdminOverview;
