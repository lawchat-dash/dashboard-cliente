import { useState, useEffect, useMemo } from 'react';
import { useClients, Client, ClientFeatures } from '@/hooks/useClient';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Copy, ExternalLink, Pencil, Trash2, Eye, EyeOff, RefreshCw, Loader2, Search } from 'lucide-react';
import { FUNNEL_STEPS, STEP_DISPLAY_NAMES } from '@/utils/normalizeStep';
import { classifyStep } from '@/utils/normalizeStep';
import { formatPercent } from '@/utils/formatters';
import { motion } from 'framer-motion';

interface PanelInput {
  panel_id: string;
  panel_name: string;
  sync_interval_minutes: number;
}

interface StepMappingInput {
  step_id: string;
  step_title: string;
  funnel_stage: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const slugify = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const LEVEL_CONFIG: Record<number, { label: string; emoji: string; color: string; bg: string }> = {
  1: { label: 'Nível 1', emoji: '🟢', color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-300' },
  2: { label: 'Nível 2', emoji: '🟠', color: 'text-orange-700', bg: 'bg-orange-100 border-orange-300' },
  3: { label: 'Nível 3', emoji: '🔴', color: 'text-red-700', bg: 'bg-red-100 border-red-300' },
};

const STAGE_DISPLAY = [
  { key: 'SDR', label: 'SDR', dot: 'bg-blue-500' },
  { key: 'CLOSER', label: 'Closer', dot: 'bg-green-500' },
  { key: 'CONTRATO', label: 'Confecção', dot: 'bg-orange-500' },
  { key: 'ETAPA DE ASSINATURA', label: 'Assinatura', dot: 'bg-amber-500' },
  { key: 'CONTRATO FECHADO', label: 'Assinado', dot: 'bg-emerald-500' },
  { key: 'DESQUALIFICADO', label: 'Desqual.', dot: 'bg-red-500' },
  { key: 'NAO ASSINOU', label: 'N. Assinou', dot: 'bg-pink-500' },
];

const AdminClients = () => {
  const { clients, loading, reload } = useClients();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [helenaCompanyId, setHelenaCompanyId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [clientLevel, setClientLevel] = useState<number>(1);
  const [panels, setPanels] = useState<PanelInput[]>([{ panel_id: '', panel_name: '', sync_interval_minutes: 10 }]);
  const [stepMappings, setStepMappings] = useState<StepMappingInput[]>([]);
  const [features, setFeatures] = useState<ClientFeatures>({ dashboard: true, pipeline: true, campanhas: true, auditoria: true, ia: false, ao_vivo: true, contratos: true, follow_up: true });
  const [allowedNumbers, setAllowedNumbers] = useState<string[]>([]);
  const [availableNumbers, setAvailableNumbers] = useState<string[]>([]);
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingClient, setSyncingClient] = useState<string | null>(null);
  const [refreshingMetrics, setRefreshingMetrics] = useState<string | null>(null);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('30d');
  const [metricsCache, setMetricsCache] = useState<any[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);

  const baseUrl = window.location.origin;

  // Load cached metrics
  useEffect(() => {
    async function loadCache() {
      setLoadingCards(true);
      const { data } = await supabase.from('client_metrics_cache').select('*');
      setMetricsCache(data || []);
      setLoadingCards(false);
    }
    loadCache();
  }, []);

  const filteredClients = useMemo(() => {
    let result = clients;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q) || (c.helena_company_id || '').toLowerCase().includes(q));
    }
    if (levelFilter !== 'all') {
      result = result.filter(c => c.client_level === parseInt(levelFilter));
    }
    return result;
  }, [clients, search, levelFilter]);

  const getClientMetrics = (clientId: string) => {
    const cached = metricsCache.find((m: any) => m.client_id === clientId && m.period === periodFilter);
    if (!cached) return { total: 0, stages: {} as Record<string, number>, convRate: 0 };
    const stages: Record<string, number> = {
      'SDR': cached.sdr || 0,
      'CLOSER': cached.closer || 0,
      'CONTRATO': cached.contrato || 0,
      'ETAPA DE ASSINATURA': cached.assinatura || 0,
      'CONTRATO FECHADO': cached.assinado || 0,
      'DESQUALIFICADO': cached.desqualificado || 0,
      'NAO ASSINOU': cached.nao_assinou || 0,
    };
    return { total: cached.total_leads || 0, stages, convRate: cached.conversion_rate || 0 };
  };

  const openNew = () => {
    setEditing(null); setName(''); setSlug(''); setHelenaCompanyId(''); setApiKey(''); setClientLevel(1);
    setPanels([{ panel_id: '', panel_name: '', sync_interval_minutes: 10 }]);
    setStepMappings([]); setFeatures({ dashboard: true, pipeline: true, campanhas: true, auditoria: true, ao_vivo: true, contratos: true, follow_up: true });
    setAllowedNumbers([]); setAvailableNumbers([]);
    setDialogOpen(true);
  };

  const openEdit = async (client: Client) => {
    setEditing(client); setName(client.name); setSlug(client.slug);
    setHelenaCompanyId(client.helena_company_id || '');
    setApiKey(client.helena_api_key); setClientLevel(client.client_level || 1);
    setFeatures(client.features || { dashboard: true, pipeline: true, campanhas: true, auditoria: true, ia: false, ao_vivo: true, contratos: true, follow_up: true });
    setAllowedNumbers(client.allowed_numbers || []);
    setAvailableNumbers([]);
    const { data } = await supabase.from('client_panels').select('*').eq('client_id', client.id);
    setPanels((data || []).map((p: any) => ({ panel_id: p.panel_id, panel_name: p.panel_name, sync_interval_minutes: p.sync_interval_minutes })));
    if ((data || []).length === 0) setPanels([{ panel_id: '', panel_name: '', sync_interval_minutes: 10 }]);
    const { data: mappings } = await supabase.from('client_step_mappings').select('*').eq('client_id', client.id);
    setStepMappings((mappings || []).map((m: any) => ({ step_id: m.step_id, step_title: m.step_title, funnel_stage: m.funnel_stage })));
    setDialogOpen(true);
    loadAvailableNumbers(client.id);
  };

  const loadAvailableNumbers = async (clientId: string) => {
    setLoadingNumbers(true);
    try {
      const { data } = await supabase
        .from('helena_sessions')
        .select('session_detail_full')
        .eq('client_id', clientId)
        .limit(5000);
      const set = new Set<string>();
      (data || []).forEach((row: any) => {
        try {
          const hid = row?.session_detail_full?.channelDetails?.humanId;
          if (hid) set.add(String(hid));
        } catch {}
      });
      setAvailableNumbers(Array.from(set).sort());
    } catch (e) { console.error(e); }
    finally { setLoadingNumbers(false); }
  };

  const loadClientSteps = async (clientId: string) => {
    setLoadingSteps(true);
    try {
      const { data } = await supabase.from('helena_cards').select('step_id, step_title').eq('client_id', clientId).not('step_id', 'is', null);
      const uniqueSteps = new Map<string, string>();
      (data || []).forEach((row: any) => { if (row.step_id && !uniqueSteps.has(row.step_id)) uniqueSteps.set(row.step_id, row.step_title || ''); });
      const existing = new Map(stepMappings.map(m => [m.step_id, m]));
      const merged: StepMappingInput[] = [];
      uniqueSteps.forEach((title, id) => { merged.push(existing.has(id) ? existing.get(id)! : { step_id: id, step_title: title, funnel_stage: '' }); });
      setStepMappings(merged);
      if (merged.length === 0) toast.info('Nenhuma etapa encontrada. Faça o sync primeiro.');
      else toast.success(`${merged.length} etapas encontradas!`);
    } catch { toast.error('Erro ao carregar etapas'); }
    finally { setLoadingSteps(false); }
  };

  const handleSave = async () => {
    if (!name || !helenaCompanyId || !apiKey) { toast.error('Preencha todos os campos obrigatórios'); return; }
    const autoSlug = slugify(name);
    setSaving(true);
    try {
      let clientId: string;
      if (editing) {
        const { error } = await supabase.from('clients').update({ name, slug: autoSlug, helena_company_id: helenaCompanyId, helena_api_key: apiKey, features: features as any, client_level: clientLevel, allowed_numbers: allowedNumbers } as any).eq('id', editing.id);
        if (error) throw error;
        clientId = editing.id;
        await supabase.from('client_panels').delete().eq('client_id', clientId);
      } else {
        const { data, error } = await supabase.from('clients').insert({ name, slug: autoSlug, helena_company_id: helenaCompanyId, helena_api_key: apiKey, features: features as any, client_level: clientLevel, allowed_numbers: allowedNumbers } as any).select().single();
        if (error) throw error;
        clientId = data.id;
      }
      const validPanels = panels.filter(p => p.panel_id && p.panel_name);
      if (validPanels.length > 0) {
        const { error: pError } = await supabase.from('client_panels').insert(validPanels.map(p => ({ client_id: clientId, panel_id: p.panel_id, panel_name: p.panel_name, sync_interval_minutes: p.sync_interval_minutes })));
        if (pError) throw pError;
      }
      // CONECTA os painéis configurados à coluna panel_ids (que o SYNC e o DASHBOARD leem
      // pra restringir). Sem isso, limitar painéis no admin não tinha efeito.
      {
        const panelIds = validPanels.map(p => p.panel_id);
        const { error: piErr } = await supabase.from('clients').update({ panel_ids: panelIds } as any).eq('id', clientId);
        if (piErr) console.error('panel_ids update error:', piErr);
      }
      await supabase.from('client_step_mappings').delete().eq('client_id', clientId);
      const validMappings = stepMappings.filter(m => m.step_id && m.funnel_stage);
      if (validMappings.length > 0) {
        const { error: mError } = await supabase.from('client_step_mappings').insert(validMappings.map(m => ({ client_id: clientId, step_id: m.step_id, step_title: m.step_title, funnel_stage: m.funnel_stage })));
        if (mError) throw mError;
      }
      try { await supabase.rpc('manage_client_cron', { p_action: 'create', p_client_slug: helenaCompanyId, p_client_id: clientId, p_interval_minutes: 60 }); } catch (cronErr) { console.error('Cron error:', cronErr); }
      toast.success(editing ? 'Cliente atualizado!' : 'Cliente criado!');
      setDialogOpen(false); reload();
    } catch (err: any) { toast.error(err.message || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (client: Client) => {
    if (!confirm(`Tem certeza que deseja excluir "${client.name}"?`)) return;
    const { error } = await supabase.from('clients').delete().eq('id', client.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Cliente excluído'); reload();
  };

  const handleSync = async (client: Client, mode: 'incremental' | 'full' = 'full') => {
    setSyncingClient(client.id);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-all-clients`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sync failed');
      toast.success(`Sync ${mode === 'incremental' ? 'incremental' : 'completo'} do ${client.name} iniciado!`);
    } catch (err: any) { toast.error(`Erro no sync: ${err.message}`); }
    finally { setSyncingClient(null); }
  };

  const copyLink = (companyId: string) => { navigator.clipboard.writeText(`${baseUrl}/d/${companyId}`); toast.success('Link copiado!'); };

  const handleRefreshMetrics = async (client: Client) => {
    setRefreshingMetrics(client.id);
    try {
      for (const period of ['all', 'today', '7d', '30d']) {
        await supabase.rpc('compute_client_metrics', { p_client_id: client.id, p_period: period });
      }
      const { data } = await supabase.from('client_metrics_cache').select('*');
      setMetricsCache(data || []);
      toast.success(`Métricas de ${client.name} atualizadas!`);
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setRefreshingMetrics(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clients.length} clientes cadastrados</p>
        </div>
        <button
          onClick={openNew}
          className="btn-lawchat group inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold"
        >
          <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/25 transition-transform duration-300 group-hover:rotate-90 group-hover:scale-110">
            <Plus className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
          <span className="relative z-10">Adicionar Cliente</span>
        </button>
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
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo Período</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : filteredClients.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum cliente encontrado.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredClients.map((client, i) => {
            const level = LEVEL_CONFIG[client.client_level] || LEVEL_CONFIG[1];
            const metrics = getClientMetrics(client.id);
            return (
              <motion.div key={client.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="shadow-card hover:shadow-card-hover transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{client.name}</CardTitle>
                        <Badge variant="outline" className={`text-xs ${level.bg} ${level.color} border`}>{level.emoji} {level.label}</Badge>
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${client.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {client.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs text-muted-foreground">/d/{client.helena_company_id || client.slug}</code>
                      <button onClick={() => copyLink(client.helena_company_id || client.slug)} className="text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /></button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Mini-dashboard */}
                    {!loadingCards && (
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase">Resumo ({periodFilter === 'all' ? 'Total' : periodFilter === 'today' ? 'Hoje' : periodFilter})</span>
                          <span className="text-sm font-bold">{metrics.total} leads</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {STAGE_DISPLAY.map(s => {
                            const count = metrics.stages[s.key] || 0;
                            const pct = metrics.total > 0 ? (count / metrics.total * 100).toFixed(1) : '0.0';
                            return (
                              <div key={s.key} className="text-center">
                                <div className="flex items-center justify-center gap-0.5 mb-0.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                                  <span className="text-[9px] text-muted-foreground truncate">{s.label}</span>
                                </div>
                                <div className="text-sm font-semibold">{count}</div>
                                <div className="text-[9px] text-muted-foreground">{pct}%</div>
                              </div>
                            );
                          })}
                        </div>
                        {metrics.total > 0 && (
                          <div className="mt-2 flex items-center justify-between text-xs border-t border-border pt-2">
                            <span className="text-muted-foreground">Taxa de Conversão</span>
                            <span className={`font-semibold ${metrics.convRate > 5 ? 'text-emerald-600' : metrics.convRate > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                              {formatPercent(metrics.convRate)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(client)}>
                        <Pencil className="mr-1 h-3 w-3" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleSync(client, 'incremental')} disabled={syncingClient === client.id}>
                        {syncingClient === client.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />} Novos
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleSync(client, 'full')} disabled={syncingClient === client.id}>
                        {syncingClient === client.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />} Sync Total
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/d/${client.helena_company_id || client.slug}`} target="_blank" rel="noopener"><ExternalLink className="mr-1 h-3 w-3" /> Abrir</a>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/admin/client/${client.helena_company_id || client.slug}`}><Eye className="mr-1 h-3 w-3" /> Ver</a>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(client)} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Nome do Cliente</label>
                <Input value={name} onChange={e => { setName(e.target.value); if (!editing) setSlug(slugify(e.target.value)); }} placeholder="Ex: LawChat" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">LawChat ID (Company ID)</label>
                <Input value={helenaCompanyId} onChange={e => setHelenaCompanyId(e.target.value.trim())} placeholder="Ex: 84782cda-838d-47e2-..." />
                <p className="mt-1 text-xs text-muted-foreground">{baseUrl}/d/{helenaCompanyId || '...'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">API Key LawChat</label>
                <div className="relative">
                  <Input type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="pn_..." className="pr-10" />
                  <button type="button" onClick={() => setShowApiKey(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Nível de Atenção</label>
                <Select value={clientLevel.toString()} onValueChange={v => setClientLevel(parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">🟢 Nível 1 - Baixo</SelectItem>
                    <SelectItem value="2">🟠 Nível 2 - Médio</SelectItem>
                    <SelectItem value="3">🔴 Nível 3 - Alto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Feature toggles */}
            <div>
              <label className="mb-2 block text-sm font-medium">Funcionalidades</label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: 'dashboard' as const, label: '📊 Dashboard' },
                  { key: 'pipeline' as const, label: '🗂️ Pipeline' },
                  { key: 'campanhas' as const, label: '📢 Campanhas' },
                  { key: 'auditoria' as const, label: '📋 Auditoria' },
                  { key: 'ao_vivo' as const, label: '📡 Ao Vivo' },
                  { key: 'contratos' as const, label: '📄 Contratos' },
                  { key: 'evolucao' as const, label: '📈 Evolução' },
                  { key: 'comparar' as const, label: '🔀 Comparar' },
                  { key: 'follow_up' as const, label: '📞 Follow-up' },
                  { key: 'notificacoes' as const, label: '🔔 Central de Notificações' },
                  { key: 'supervisao' as const, label: '🛡️ Supervisão' },
                  { key: 'ia' as const, label: '🤖 Agente IA' },
                  { key: 'templates_api' as const, label: '📋 Templates API Oficial' },
                ] as const).map(feat => (
                  <div key={feat.key} className="flex items-center gap-2">
                    <Switch id={`feat-${feat.key}`} checked={features[feat.key]} onCheckedChange={v => setFeatures(prev => ({ ...prev, [feat.key]: v }))} />
                    <Label htmlFor={`feat-${feat.key}`} className="text-sm">{feat.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Panels */}
            <div>
              <label className="mb-1 block text-sm font-medium">Painéis CRM</label>
              <div className="space-y-2">
                {panels.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={p.panel_id} onChange={e => { const n = [...panels]; n[i].panel_id = e.target.value; setPanels(n); }} placeholder="ID do Painel" className="flex-1" />
                    <Input value={p.panel_name} onChange={e => { const n = [...panels]; n[i].panel_name = e.target.value; setPanels(n); }} placeholder="Nome" className="flex-1" />
                    <Input type="number" value={p.sync_interval_minutes} onChange={e => { const n = [...panels]; n[i].sync_interval_minutes = parseInt(e.target.value) || 10; setPanels(n); }} className="w-16" title="Min sync" />
                    {panels.length > 1 && <Button size="sm" variant="ghost" onClick={() => setPanels(panels.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>}
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setPanels([...panels, { panel_id: '', panel_name: '', sync_interval_minutes: 10 }])}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar Painel
                </Button>
              </div>
            </div>

            {/* Allowed Numbers - filter dashboard by channel/WhatsApp number */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium">📱 Números do Cliente (Dashboard)</label>
                {editing && (
                  <Button size="sm" variant="outline" onClick={() => loadAvailableNumbers(editing.id)} disabled={loadingNumbers}>
                    {loadingNumbers ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />} Carregar Números
                  </Button>
                )}
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                Selecione os números que devem aparecer no dashboard. Se nenhum for selecionado, todos serão exibidos. {editing ? 'Os números são carregados das sessões já sincronizadas.' : 'Salve e faça sync primeiro.'}
              </p>

              {availableNumbers.length === 0 && allowedNumbers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  {editing ? 'Nenhum número disponível ainda. Faça o sync primeiro.' : 'Disponível após salvar e sincronizar.'}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {allowedNumbers.length === 0 ? 'Todos serão exibidos' : `${allowedNumbers.length} de ${availableNumbers.length} selecionado(s)`}
                    </span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setAllowedNumbers(availableNumbers)} className="text-primary hover:underline">Selecionar todos</button>
                      <span className="text-muted-foreground">·</span>
                      <button type="button" onClick={() => setAllowedNumbers([])} className="text-muted-foreground hover:underline">Limpar</button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 space-y-0.5">
                    {availableNumbers.map(n => {
                      const checked = allowedNumbers.includes(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setAllowedNumbers(checked ? allowedNumbers.filter(x => x !== n) : [...allowedNumbers, n])}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${checked ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'}`}
                        >
                          <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                            {checked && <span className="text-[9px]">✓</span>}
                          </div>
                          <span className="truncate">{n}</span>
                        </button>
                      );
                    })}
                    {allowedNumbers.filter(n => !availableNumbers.includes(n)).map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setAllowedNumbers(allowedNumbers.filter(x => x !== n))}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left bg-primary/10 text-primary font-medium"
                      >
                        <div className="h-3.5 w-3.5 rounded border bg-primary border-primary text-primary-foreground flex items-center justify-center shrink-0">
                          <span className="text-[9px]">✓</span>
                        </div>
                        <span className="truncate">{n}</span>
                        <span className="ml-auto text-[9px] text-muted-foreground">(salvo)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium">Mapeamento de Etapas</label>
                {editing && (
                  <Button size="sm" variant="outline" onClick={() => loadClientSteps(editing.id)} disabled={loadingSteps}>
                    {loadingSteps ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />} Carregar Etapas
                  </Button>
                )}
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                {editing ? 'Clique em "Carregar Etapas" para buscar do CRM. Múltiplas etapas podem apontar para o mesmo estágio do funil.' : 'Salve e faça sync primeiro.'}
              </p>

              {/* Group by funnel stage for visual clarity */}
              {stepMappings.length > 0 && (() => {
                const grouped = FUNNEL_STEPS.reduce((acc, stage) => {
                  const items = stepMappings.filter(m => m.funnel_stage === stage);
                  if (items.length > 0) acc.push({ stage, items });
                  return acc;
                }, [] as { stage: string; items: StepMappingInput[] }[]);
                const unmapped = stepMappings.filter(m => !m.funnel_stage);
                return (
                  <div className="space-y-3 mb-3">
                    {grouped.map(g => (
                      <div key={g.stage} className="rounded-lg border border-border p-2">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`h-2 w-2 rounded-full ${STAGE_DISPLAY.find(s => s.key === g.stage)?.dot || 'bg-muted-foreground'}`} />
                          <span className="text-xs font-semibold text-foreground">{STEP_DISPLAY_NAMES[g.stage] || g.stage}</span>
                          <Badge variant="secondary" className="text-[10px] h-4">{g.items.length} etapa{g.items.length > 1 ? 's' : ''}</Badge>
                        </div>
                        {g.items.map(m => {
                          const idx = stepMappings.indexOf(m);
                          return (
                            <div key={idx} className="ml-4 flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
                              <span className="truncate flex-1" title={m.step_title}>{m.step_title || m.step_id}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {unmapped.length > 0 && (
                      <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/50 dark:bg-amber-900/10 p-2">
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">⚠️ Sem mapeamento ({unmapped.length})</span>
                        {unmapped.map(m => {
                          const idx = stepMappings.indexOf(m);
                          return (
                            <div key={idx} className="ml-4 text-xs text-muted-foreground truncate py-0.5" title={m.step_title}>{m.step_title || m.step_id}</div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-2">
                {stepMappings.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-2">
                    <div className="flex-1 space-y-1">
                      <p className="text-xs font-medium truncate" title={m.step_title}>{m.step_title || m.step_id}</p>
                      <p className="text-[10px] text-muted-foreground truncate">ID: {m.step_id}</p>
                    </div>
                    <Select value={m.funnel_stage} onValueChange={v => { const n = [...stepMappings]; n[i].funnel_stage = v; setStepMappings(n); }}>
                      <SelectTrigger className="w-48"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>
                        {FUNNEL_STEPS.map(step => <SelectItem key={step} value={step}>{STEP_DISPLAY_NAMES[step] || step}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" onClick={() => setStepMappings(stepMappings.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setStepMappings([...stepMappings, { step_id: '', step_title: '', funnel_stage: '' }])}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar Manual
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar Cliente'}
              </Button>
              {editing && (
                <Button variant="outline" className="w-full" onClick={() => handleRefreshMetrics(editing)} disabled={refreshingMetrics === editing.id}>
                  {refreshingMetrics === editing.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Sincronizar Métricas com Mapeamento
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminClients;
