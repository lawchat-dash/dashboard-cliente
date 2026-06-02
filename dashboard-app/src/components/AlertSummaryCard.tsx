import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLiveMessages, TimeWindow, LiveSession } from '@/hooks/useLiveMessages';
import { AlertTriangle, ShieldAlert, Radio, MessageCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AlertChatModal from './AlertChatModal';
import { markResolved } from '@/lib/resolvedAlerts';
import { useToast } from '@/hooks/use-toast';

interface AlertSummaryCardProps {
  clientId?: string;
}

const AlertSummaryCard = ({ clientId }: AlertSummaryCardProps) => {
  const { sessions, hasActiveMessages } = useLiveMessages(clientId, '3h' as TimeWindow);
  const [selected, setSelected] = useState<LiveSession | null>(null);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const alerts = useMemo(() => {
    const red = sessions.filter(s => s.health === 'red');
    const yellow = sessions.filter(s => s.health === 'yellow');
    return { red, yellow, total: red.length + yellow.length, all: [...red, ...yellow] };
  }, [sessions]);

  if (!hasActiveMessages || alerts.total === 0) return null;

  const openChat = (s: LiveSession) => {
    setSelected(s);
    setOpen(true);
  };

  const resolve = (s: LiveSession) => {
    markResolved(s.session_id, s.last_message_at);
    toast({ title: 'Alerta resolvido', description: `${s.contact_name || 'Lead'} dispensado.` });
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 shadow-card"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Radio className="h-4 w-4 text-destructive" />
              <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive animate-pulse" />
            </div>
            <h3 className="text-sm font-bold text-foreground">Alertas ao Vivo</h3>
          </div>
          <span className="text-xs text-muted-foreground">últimas 3h</span>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {alerts.red.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
              <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
              <div>
                <p className="text-lg font-bold text-destructive leading-none">{alerts.red.length}</p>
                <p className="text-[10px] text-destructive/70 mt-0.5">Sem resposta 10min+</p>
              </div>
            </div>
          )}
          {alerts.yellow.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-lg font-bold text-amber-500 leading-none">{alerts.yellow.length}</p>
                <p className="text-[10px] text-amber-500/70 mt-0.5">Inativo 3h+</p>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {alerts.all.map(s => {
            const isRed = s.health === 'red';
            const dotColor = isRed ? 'bg-destructive' : 'bg-amber-500';
            const textColor = isRed ? 'text-destructive/90' : 'text-amber-600 dark:text-amber-500';
            const reasonColor = isRed ? 'text-destructive/60' : 'text-amber-600/70 dark:text-amber-500/60';
            return (
              <div
                key={s.session_id}
                className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5 hover:bg-background/70 transition-colors"
              >
                <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-medium truncate ${textColor}`}>
                    {s.contact_name || s.contact_phone || 'Desconhecido'}
                  </p>
                  {s.healthReason && (
                    <p className={`text-[10px] truncate ${reasonColor}`}>{s.healthReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => openChat(s)}
                    title="Abrir chat"
                  >
                    <MessageCircle className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-primary hover:text-primary"
                    onClick={() => resolve(s)}
                    title="Marcar resolvido"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
      <AlertChatModal session={selected} open={open} onOpenChange={setOpen} />
    </>
  );
};

export default AlertSummaryCard;
