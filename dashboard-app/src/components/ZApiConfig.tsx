import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, MessageSquare, Save, Image } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ZApiRow {
  id: string;
  client_id: string | null;
  instance_id: string;
  instance_token: string;
  client_token: string;
  report_template: string;
  enabled: boolean;
}

const PLACEHOLDERS = [
  '{client_name}', '{date}', '{period}', '{total_leads}', '{sdr}', '{closer}',
  '{contrato}', '{assinatura}', '{assinado}', '{desqualificado}', '{nao_assinou}', '{conversion_rate}',
];

const PERIODS = [
  { value: 'today', label: 'Hoje' },
  { value: '3d', label: 'Últimos 3 Dias' },
  { value: '7d', label: 'Últimos 7 Dias' },
  { value: '15d', label: 'Últimos 15 Dias' },
  { value: '30d', label: 'Últimos 30 Dias' },
  { value: 'complete', label: '📋 Completo (Todos os Períodos)' },
];

const DEFAULT_TEMPLATE = `📊 *Relatório {period} - {client_name}*
📅 {date}

📌 *Resumo do Funil:*
• Total de Leads: {total_leads}
• SDR: {sdr}
• Closer: {closer}
• Contrato: {contrato}
• Assinatura: {assinatura}
• ✅ Assinados: {assinado}
• ❌ Desqualificados: {desqualificado}
• 📈 Taxa de Conversão: {conversion_rate}%`;

const ZApiConfig = () => {
  const [config, setConfig] = useState<ZApiRow | null>(null);
  const [instanceId, setInstanceId] = useState('');
  const [instanceToken, setInstanceToken] = useState('');
  const [clientToken, setClientToken] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('55');
  const [testPeriod, setTestPeriod] = useState('today');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('zapi_config')
      .select('*')
      .is('client_id', null)
      .maybeSingle();
    const row = data as unknown as ZApiRow | null;
    if (row) {
      setConfig(row);
      setInstanceId(row.instance_id);
      setInstanceToken(row.instance_token);
      setClientToken(row.client_token);
      setTemplate(row.report_template);
      setEnabled(row.enabled);
    }
    setLoading(false);
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      client_id: null as unknown as string,
      instance_id: instanceId,
      instance_token: instanceToken,
      client_token: clientToken,
      report_template: template,
      enabled,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (config) {
      ({ error } = await supabase.from('zapi_config').update(payload).eq('id', config.id));
    } else {
      ({ error } = await supabase.from('zapi_config').insert(payload));
    }

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configuração salva!' });
      await loadConfig();
    }
    setSaving(false);
  };

  const sendTest = async () => {
    if (!instanceId || !instanceToken) {
      toast({ title: 'Configure a instância Z-API primeiro', variant: 'destructive' });
      return;
    }
    const cleanPhone = testPhone.replace(/\D/g, '');
    if (cleanPhone.length < 12) {
      toast({ title: 'Informe um número válido para o teste', description: 'Ex: 5511999999999', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-daily-report', {
        body: { test: true, testPhone: cleanPhone, testPeriod },
      });
      if (error) throw error;
      const res = data as any;
      if (res?.results?.[0]?.error) {
        toast({ title: 'Erro no envio', description: res.results[0].error, variant: 'destructive' });
      } else {
        toast({ title: 'Teste enviado!', description: `Relatório ${PERIODS.find(p => p.value === testPeriod)?.label} enviado para +${cleanPhone}` });
      }
    } catch (err: any) {
      toast({ title: 'Erro no teste', description: err.message, variant: 'destructive' });
    }
    setTesting(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5 text-primary" />
          Integração Z-API (Notificações WhatsApp)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Instância única global. Os relatórios são enviados como <strong>imagem estilizada</strong> gerada automaticamente com os dados do cliente.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Z-API Credentials */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Instance ID</Label>
                <Input value={instanceId} onChange={e => setInstanceId(e.target.value)} placeholder="SUA_INSTANCIA" />
              </div>
              <div className="space-y-2">
                <Label>Token</Label>
                <Input value={instanceToken} onChange={e => setInstanceToken(e.target.value)} placeholder="SEU_TOKEN" type="password" />
              </div>
              <div className="space-y-2">
                <Label>Client-Token</Label>
                <Input value={clientToken} onChange={e => setClientToken(e.target.value)} placeholder="TOKEN DE SEGURANÇA" type="password" />
              </div>
            </div>

            {/* Toggle */}
            <div className="flex items-center gap-3">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <Label>Notificações ativas</Label>
            </div>

            {/* Template (text fallback) */}
            <div className="space-y-2">
              <Label>Template do Relatório (fallback texto)</Label>
              <p className="text-xs text-muted-foreground">
                Usado caso a geração de imagem não esteja disponível. A imagem é gerada automaticamente com o estilo do dashboard.
              </p>
              <div className="flex flex-wrap gap-1 mb-2">
                {PLACEHOLDERS.map(p => (
                  <Badge
                    key={p}
                    variant="secondary"
                    className="cursor-pointer font-mono text-xs hover:bg-primary/20"
                    onClick={() => setTemplate(t => t + ' ' + p)}
                  >
                    {p}
                  </Badge>
                ))}
              </div>
              <Textarea
                value={template}
                onChange={e => setTemplate(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>

            {/* Actions */}
            <div className="space-y-4">
              <div className="flex gap-3">
                <Button onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar
                </Button>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Image className="h-4 w-4 text-primary" />
                  Enviar Teste (com imagem)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Gera uma imagem estilizada com dados reais do cliente Sousa & Costa e envia para o número informado.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone</Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">+</span>
                      <Input
                        value={testPhone}
                        onChange={e => setTestPhone(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="5511999999999"
                        className="rounded-l-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Período do Relatório</Label>
                    <Select value={testPeriod} onValueChange={setTestPeriod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PERIODS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button variant="outline" onClick={sendTest} disabled={testing || !config} className="w-full sm:w-auto">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar Teste
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ZApiConfig;
