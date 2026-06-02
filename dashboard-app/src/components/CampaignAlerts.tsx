import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { AlertTriangle, ChevronDown, Users, FileX, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatPercent } from '@/utils/formatters';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CampaignAlertsProps {
  cards: Card[];
  sessions: Session[];
}

interface AlertItem {
  campaign: string;
  totalLeads: number;
  won: number;
  disqualified: number;
  qualified: number;
  disqualificationRate: number;
  conversionRate: number;
  reason: string;
  severity: 'high' | 'medium';
}

const QUALIFIED_STEPS = ['CLOSER', 'CONTRATO', 'ETAPA DE ASSINATURA', 'CONTRATO FECHADO'];

const CampaignAlerts = ({ cards, sessions }: CampaignAlertsProps) => {
  const { classify } = useClassify();
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [showAll, setShowAll] = useState(false);

  const alerts = useMemo(() => {
    const cardMap = new Map(cards.filter(c => !c.archived).map(c => [c.id, c]));
    const campMap = new Map<string, { total: number; won: number; disqualified: number; qualified: number }>();

    for (const s of sessions) {
      const campaign = s.utmCampaign;
      if (!campaign) continue;
      const card = cardMap.get(s.cardId);
      if (!card) continue;

      const step = classify(card);
      const entry = campMap.get(campaign) || { total: 0, won: 0, disqualified: 0, qualified: 0 };
      entry.total++;
      if (step === 'CONTRATO FECHADO') entry.won++;
      if (step === 'DESQUALIFICADO') entry.disqualified++;
      if (QUALIFIED_STEPS.includes(step)) entry.qualified++;
      campMap.set(campaign, entry);
    }

    const result: AlertItem[] = [];
    for (const [campaign, stats] of campMap) {
      const disqualificationRate = stats.total > 0 ? (stats.disqualified / stats.total) * 100 : 0;
      const conversionRate = stats.total > 0 ? (stats.won / stats.total) * 100 : 0;

      if (stats.total > 5 && stats.won === 0) {
        result.push({
          campaign,
          totalLeads: stats.total,
          won: stats.won,
          disqualified: stats.disqualified,
          qualified: stats.qualified,
          disqualificationRate,
          conversionRate,
          reason: 'Alto volume sem conversões',
          severity: 'high',
        });
      } else if (disqualificationRate > 50 && stats.total > 3) {
        result.push({
          campaign,
          totalLeads: stats.total,
          won: stats.won,
          disqualified: stats.disqualified,
          qualified: stats.qualified,
          disqualificationRate,
          conversionRate,
          reason: 'Alta taxa de desqualificação',
          severity: 'high',
        });
      } else if (conversionRate < 5 && stats.total > 5 && stats.won > 0) {
        result.push({
          campaign,
          totalLeads: stats.total,
          won: stats.won,
          disqualified: stats.disqualified,
          qualified: stats.qualified,
          disqualificationRate,
          conversionRate,
          reason: 'Conversão muito baixa',
          severity: 'medium',
        });
      }
    }

    return result.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
      return b.totalLeads - a.totalLeads;
    });
  }, [cards, sessions]);

  if (alerts.length === 0) return null;

  const visibleAlerts = alerts.slice(0, 5);
  const hasMore = alerts.length > 5;

  const severityIcon = (reason: string) => {
    if (reason.includes('volume')) return <Users className="h-3.5 w-3.5" />;
    if (reason.includes('desqualificação')) return <FileX className="h-3.5 w-3.5" />;
    return <TrendingDown className="h-3.5 w-3.5" />;
  };

  const AlertRow = ({ alert, index }: { alert: AlertItem; index: number }) => (
    <motion.button
      key={alert.campaign}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => setSelectedAlert(alert)}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-emerald-500/10 hover:border-emerald-500/30"
    >
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
        alert.severity === 'high' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'
      }`}>
        {severityIcon(alert.reason)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{alert.campaign}</p>
        <p className="text-xs text-muted-foreground">
          {alert.totalLeads} leads · {alert.won} contratos · {formatPercent(alert.disqualificationRate)} desqualif.
        </p>
      </div>
      <Badge className={`text-[10px] whitespace-nowrap ${
        alert.severity === 'high'
          ? 'bg-red-500/10 text-red-500 border-red-500/20'
          : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
      }`}>
        {alert.reason}
      </Badge>
    </motion.button>
  );

  return (
    <>
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <h3 className="text-sm font-semibold text-foreground">Campanhas que Precisam de Atenção</h3>
          <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30 text-[10px]">
            {alerts.length} alerta{alerts.length > 1 ? 's' : ''}
          </Badge>
        </div>

        <div className="space-y-2">
          {visibleAlerts.map((alert, i) => (
            <AlertRow key={alert.campaign} alert={alert} index={i} />
          ))}
        </div>

        {hasMore && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-primary transition-colors hover:bg-muted/40"
          >
            Ver mais ({alerts.length - 5})
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Modal ver mais */}
      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Todas as Campanhas com Alertas</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {alerts.length} campanhas precisam de atenção
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <AlertRow key={alert.campaign} alert={alert} index={i} />
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Modal de detalhe */}
      <Dialog open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground">Detalhes da Campanha</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground truncate">
              {selectedAlert?.campaign}
            </DialogDescription>
          </DialogHeader>
          {selectedAlert && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Total de Leads</p>
                  <p className="text-xl font-bold text-foreground">{selectedAlert.totalLeads}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Contratos</p>
                  <p className="text-xl font-bold text-emerald-500">{selectedAlert.won}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Qualificados</p>
                  <p className="text-xl font-bold text-blue-500">{selectedAlert.qualified}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Desqualificados</p>
                  <p className="text-xl font-bold text-red-500">{selectedAlert.disqualified}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxa de conversão</span>
                  <span className="font-medium text-foreground">{formatPercent(selectedAlert.conversionRate)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxa de desqualificação</span>
                  <span className="font-medium text-foreground">{formatPercent(selectedAlert.disqualificationRate)}</span>
                </div>
              </div>
              <div className={`rounded-lg p-3 ${
                selectedAlert.severity === 'high' ? 'bg-red-500/10 border border-red-500/20' : 'bg-yellow-500/10 border border-yellow-500/20'
              }`}>
                <p className="text-xs font-medium text-foreground mb-1">⚠️ {selectedAlert.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedAlert.reason.includes('volume')
                    ? 'Esta campanha tem muitos leads mas nenhuma conversão. Considere revisar a segmentação, a qualidade dos leads ou o processo de vendas.'
                    : selectedAlert.reason.includes('desqualificação')
                    ? 'Mais da metade dos leads desta campanha foram desqualificados. Revise o público-alvo e os critérios de qualificação.'
                    : 'A taxa de conversão está abaixo de 5%. Analise o funil para identificar gargalos no processo.'}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CampaignAlerts;
