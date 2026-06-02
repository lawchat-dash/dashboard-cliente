import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import ZApiConfig from '@/components/ZApiConfig';

const METRIC_DOCS = [
  {
    title: 'Cards Totais',
    description: 'Quantidade total de cards não arquivados no período selecionado.',
    formula: 'COUNT(cards WHERE archived = false)',
  },
  {
    title: 'Contratos Assinados',
    description: 'Número de leads que chegaram à etapa "Contrato Assinado".',
    formula: 'COUNT(cards WHERE step = "CONTRATO FECHADO")',
  },
  {
    title: 'Taxa de Conversão',
    description: 'Percentual de leads que fecharam contrato sobre o total.',
    formula: '(Contratos Assinados ÷ Total de Cards) × 100',
  },
  {
    title: 'Taxa de Eficiência',
    description: 'Percentual de contratos assinados sobre leads que avançaram do SDR.',
    formula: '(Contratos Assinados ÷ (Total - SDR - Desqualificados)) × 100',
  },
  {
    title: '% Lead Qualificado',
    description: 'Percentual de leads qualificados (Closer + Confecção + Assinatura + Assinado) sobre o total.',
    formula: '(Qualificados ÷ Total) × 100',
  },
];

const STAGE_DOCS = [
  { name: 'SDR', description: 'Primeiro contato e qualificação inicial', color: 'bg-blue-500' },
  { name: 'Closer', description: 'Negociação comercial ativa', color: 'bg-green-500' },
  { name: 'Confecção de Contrato', description: 'Contrato em elaboração', color: 'bg-orange-500' },
  { name: 'Aguardando Assinatura', description: 'Contrato enviado, aguardando assinatura do cliente', color: 'bg-amber-500' },
  { name: 'Contrato Assinado', description: 'Negócio fechado com sucesso', color: 'bg-emerald-500' },
  { name: 'Desqualificado', description: 'Lead sem interesse ou fora do perfil', color: 'bg-red-500' },
  { name: 'Não Assinou', description: 'Lead que desistiu após etapa de fechamento', color: 'bg-pink-500' },
];

const AdminSettings = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Documentação das métricas e configurações gerais</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info className="h-5 w-5 text-primary" />
            Métricas e Fórmulas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {METRIC_DOCS.map(m => (
            <div key={m.title} className="rounded-lg border border-border p-4">
              <h3 className="font-semibold text-foreground">{m.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
              <Badge variant="secondary" className="mt-2 font-mono text-xs">{m.formula}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Etapas do Funil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {STAGE_DOCS.map(s => (
            <div key={s.name} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <span className={`h-3 w-3 rounded-full ${s.color}`} />
              <div>
                <p className="font-medium text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tags de Nível de Atenção</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <span className="text-lg">🟢</span>
            <div>
              <p className="font-medium text-emerald-800">Nível 1 - Verde</p>
              <p className="text-xs text-emerald-600">Cliente com bons resultados, necessita atenção mínima</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
            <span className="text-lg">🟠</span>
            <div>
              <p className="font-medium text-orange-800">Nível 2 - Laranja</p>
              <p className="text-xs text-orange-600">Cliente que precisa de acompanhamento moderado</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <span className="text-lg">🔴</span>
            <div>
              <p className="font-medium text-red-800">Nível 3 - Vermelho</p>
              <p className="text-xs text-red-600">Cliente crítico, necessita atenção máxima e intervenção imediata</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ZApiConfig />
    </div>
  );
};

export default AdminSettings;
