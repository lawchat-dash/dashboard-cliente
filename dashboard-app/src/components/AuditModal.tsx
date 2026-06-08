import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Card, Session } from '@/api/helena';
import AuditPage from '@/components/AuditPage';

interface AuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'all' | 'closed';
  cards: Card[];
  sessions: Session[];
  initialStage?: string;
}

/**
 * Wrapper fino: abre a EXPERIÊNCIA da Auditoria (AuditPage — a versão bonita,
 * com etapas + lista de leads + preview de chat + filtro de tags) dentro de um
 * modal. Usado por KPICards, StageMetrics e CampaignQualificationCards no clique
 * em "Total de Leads"/etapa, substituindo o painel antigo.
 */
const AuditModal = ({ open, onOpenChange, mode, cards, sessions, initialStage }: AuditModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(1500px,96vw)] w-[96vw] h-[92vh] p-0 gap-0 overflow-hidden border-border bg-transparent shadow-2xl sm:rounded-2xl"
      >
        <DialogTitle className="sr-only">Auditoria de Leads</DialogTitle>
        <div className="h-full w-full">
          {open && (
            <AuditPage
              cards={cards}
              sessions={sessions}
              initialStage={initialStage}
              mode={mode}
              embedded
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuditModal;
