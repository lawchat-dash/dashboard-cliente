import { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, Loader2, Clock, FileText, CalendarDays, CalendarRange, Info, BarChart3, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface NotificationSettingsProps {
  clientId: string;
  collapsed?: boolean;
}

interface NotifRow {
  id: string;
  phone: string;
  enabled: boolean;
  report_time: string;
  report_daily: boolean;
  report_weekly: boolean;
  report_monthly: boolean;
  report_mode: string;
  report_period: string;
}

const formatPhone = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.length > 0 && !digits.startsWith('55')) {
    digits = '55' + digits;
  }
  digits = digits.slice(0, 13);
  if (digits.length <= 2) return `+${digits}`;
  if (digits.length <= 4) return `+${digits.slice(0, 2)} (${digits.slice(2)}`;
  if (digits.length <= 9) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4)}`;
  return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
};

const stripPhone = (v: string) => v.replace(/\D/g, '');

const REPORT_MODES = [
  { value: 'all', label: 'Todos os Leads', description: 'Novos + movimentações' },
  { value: 'new_only', label: 'Só Leads Novos', description: 'Apenas leads que entraram no período' },
  { value: 'updates_only', label: 'Só Movimentações', description: 'Leads antigos que mudaram de etapa' },
];

const PERIODS = [
  { value: 'today', label: 'Hoje' },
  { value: '3d', label: '3 Dias' },
  { value: '7d', label: '7 Dias' },
  { value: '15d', label: '15 Dias' },
  { value: '30d', label: '30 Dias' },
  { value: 'complete', label: '📋 Completo' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: `${String(i).padStart(2, '0')}:00`,
  label: `${String(i).padStart(2, '0')}:00`,
}));

const NotificationSettings = ({ clientId, collapsed }: NotificationSettingsProps) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [newPhone, setNewPhone] = useState('+55 ');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('client_id', clientId);
    setRows((data as unknown as NotifRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const addPhone = async () => {
    let digits = stripPhone(newPhone);
    if (!digits.startsWith('55')) digits = '55' + digits;
    if (digits.length < 12) {
      toast({ title: 'Número inválido', description: 'Insira o número com DDD+número (ex: 11 99999-9999)', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('notification_settings').insert({
      client_id: clientId,
      phone: digits,
      enabled: true,
      report_time: '08:00',
      report_daily: true,
      report_weekly: false,
      report_monthly: false,
      report_mode: 'all',
      report_period: 'today',
    } as any);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      setNewPhone('+55 ');
      await load();
      toast({ title: 'Número adicionado!' });
    }
    setSaving(false);
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    await supabase.from('notification_settings').update({ enabled }).eq('id', id);
    setRows(r => r.map(x => x.id === id ? { ...x, enabled } : x));
  };

  const updateField = async (id: string, field: string, value: any) => {
    await supabase.from('notification_settings').update({ [field]: value } as any).eq('id', id);
    setRows(r => r.map(x => x.id === id ? { ...x, [field]: value } : x));
  };

  const remove = async (id: string) => {
    await supabase.from('notification_settings').delete().eq('id', id);
    setRows(r => r.filter(x => x.id !== id));
    toast({ title: 'Número removido' });
  };

  const getSelectedPeriods = (val: string | undefined): string[] => {
    if (!val) return ['today'];
    return val.split(',').filter(Boolean);
  };

  const togglePeriod = async (id: string, current: string | undefined, period: string) => {
    const selected = getSelectedPeriods(current);
    let updated: string[];
    if (selected.includes(period)) {
      updated = selected.filter(p => p !== period);
      if (updated.length === 0) updated = ['today']; // at least one
    } else {
      // If selecting "complete", clear others; if selecting individual, remove "complete"
      if (period === 'complete') {
        updated = ['complete'];
      } else {
        updated = [...selected.filter(p => p !== 'complete'), period];
      }
    }
    const newVal = updated.join(',');
    await updateField(id, 'report_period', newVal);
  };

  const sendTest = async (row: NotifRow) => {
    setTestingId(row.id);
    const periods = getSelectedPeriods(row.report_period);
    try {
      for (const period of periods) {
        const { data, error } = await supabase.functions.invoke('send-daily-report', {
          body: { test: true, testPhone: row.phone, testPeriod: period, clientId },
        });
        if (error) throw error;
        const res = data as any;
        if (res?.results?.[0]?.error) {
          toast({ title: 'Erro no envio', description: res.results[0].error, variant: 'destructive' });
          break;
        }
      }
      const labels = periods.map(p => PERIODS.find(x => x.value === p)?.label || p).join(', ');
      toast({ title: '✅ Teste enviado!', description: `${periods.length} relatório(s) (${labels}) enviado(s) para ${formatPhone(row.phone)}` });
    } catch (err: any) {
      toast({ title: 'Erro no teste', description: err.message, variant: 'destructive' });
    }
    setTestingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={`flex items-center gap-3 rounded-xl text-sm font-medium text-[hsl(220,10%,55%)] transition-all duration-200 hover:bg-[hsl(210,10%,15%)] hover:text-white w-full ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
          }`}
          title="Notificações WhatsApp"
        >
          <Bell className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">Notificações</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notificações WhatsApp
          </DialogTitle>
          <DialogDescription>
            Configure seus relatórios automáticos via WhatsApp. Cada relatório é enviado como uma <strong>imagem estilizada</strong> com os dados do período selecionado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Add new phone */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Adicionar número</Label>
            <div className="flex gap-2">
              <Input
                placeholder="+55 (11) 99999-9999"
                value={newPhone}
                onChange={e => setNewPhone(formatPhone(e.target.value))}
                className="flex-1"
              />
              <Button onClick={addPhone} disabled={saving} size="sm" className="shrink-0">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">O código +55 é adicionado automaticamente</p>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum número cadastrado ainda.
            </p>
          ) : (
            <div className="space-y-4">
              {rows.map(row => (
                <div key={row.id} className="rounded-xl border border-border p-4 space-y-3">
                  {/* Header: phone + toggle + delete */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={row.enabled}
                        onCheckedChange={v => toggleEnabled(row.id, v)}
                      />
                      <span className="text-sm font-mono font-medium">
                        {formatPhone(row.phone)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => sendTest(row)}
                            disabled={testingId === row.id}
                            className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                            title="Enviar teste"
                          >
                            {testingId === row.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Enviar relatório de teste agora</TooltipContent>
                      </Tooltip>
                      <button
                        onClick={() => remove(row.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {row.enabled && (
                    <>
                      {/* Report periods (multi-select) */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                          <BarChart3 className="h-3 w-3" />
                          Períodos do Relatório
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {PERIODS.map(p => {
                            const selected = getSelectedPeriods(row.report_period).includes(p.value);
                            return (
                              <button
                                key={p.value}
                                onClick={() => togglePeriod(row.id, row.report_period, p.value)}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                  selected
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:border-primary/30'
                                }`}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Selecione um ou mais períodos. Cada período selecionado gera uma imagem separada no envio.
                        </p>
                      </div>

                      {/* Report frequency */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                          <FileText className="h-3 w-3" />
                          Frequência dos Relatórios
                        </Label>
                        <div className="flex gap-2">
                          {[
                            { key: 'report_daily', label: 'Diário', icon: CalendarDays },
                            { key: 'report_weekly', label: 'Semanal', icon: CalendarRange },
                            { key: 'report_monthly', label: 'Mensal', icon: CalendarRange },
                          ].map(freq => (
                            <button
                              key={freq.key}
                              onClick={() => updateField(row.id, freq.key, !(row as any)[freq.key])}
                              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                                (row as any)[freq.key]
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border text-muted-foreground hover:border-primary/30'
                              }`}
                            >
                              <freq.icon className="h-3 w-3" />
                              {freq.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Time picker */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          Horário de Envio
                        </Label>
                        <Select
                          value={row.report_time}
                          onValueChange={v => updateField(row.id, 'report_time', v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-48">
                            {HOURS.map(h => (
                              <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Report mode */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Info className="h-3 w-3" />
                          Tipo de Dados
                        </Label>
                        <div className="space-y-1.5">
                          {REPORT_MODES.map(mode => (
                            <button
                              key={mode.value}
                              onClick={() => updateField(row.id, 'report_mode', mode.value)}
                              className={`w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                row.report_mode === mode.value
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border hover:border-primary/30'
                              }`}
                            >
                              <div className={`mt-0.5 h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                row.report_mode === mode.value ? 'border-primary' : 'border-muted-foreground/40'
                              }`}>
                                {row.report_mode === mode.value && (
                                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                                )}
                              </div>
                              <div>
                                <p className={`text-xs font-medium ${row.report_mode === mode.value ? 'text-primary' : 'text-foreground'}`}>
                                  {mode.label}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{mode.description}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NotificationSettings;
