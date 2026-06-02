import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, ExternalLink, ShieldAlert, AlertTriangle } from 'lucide-react';
import { markResolved } from '@/lib/resolvedAlerts';
import { useToast } from '@/hooks/use-toast';
import type { LiveSession } from '@/hooks/useLiveMessages';

interface AlertChatModalProps {
  session: LiveSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved?: () => void;
}

const AlertChatModal = ({ session, open, onOpenChange, onResolved }: AlertChatModalProps) => {
  const { toast } = useToast();

  if (!session) return null;

  const handleResolve = () => {
    markResolved(session.session_id, session.last_message_at);
    toast({ title: 'Alerta resolvido', description: 'Voltará se houver nova mensagem do lead.' });
    onResolved?.();
    onOpenChange(false);
  };

  const isRed = session.health === 'red';
  const HealthIcon = isRed ? ShieldAlert : AlertTriangle;
  const healthColor = isRed ? 'text-destructive' : 'text-amber-500';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="flex items-start gap-3 min-w-0">
              <HealthIcon className={`h-5 w-5 ${healthColor} shrink-0 mt-0.5`} />
              <div className="min-w-0">
                <DialogTitle className="truncate">
                  {session.contact_name || session.contact_phone || 'Conversa'}
                </DialogTitle>
                {session.healthReason && (
                  <p className={`text-xs ${healthColor} mt-0.5`}>{session.healthReason}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`https://advmidia.wts.chat/chat2/sessions/${session.session_id}`, '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir
              </Button>
              <Button size="sm" onClick={handleResolve}>
                <Check className="h-3.5 w-3.5" />
                Marcar resolvido
              </Button>
            </div>
          </div>
        </DialogHeader>
        <iframe
          src={`https://advmidia.wts.chat/chat2/sessions/${session.session_id}/preview`}
          className="flex-1 w-full border-0 bg-background"
          title="Chat Preview"
        />
      </DialogContent>
    </Dialog>
  );
};

export default AlertChatModal;
