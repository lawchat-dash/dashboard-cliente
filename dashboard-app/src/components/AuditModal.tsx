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
        // !flex !flex-col: o DialogContent base é `grid`, e dentro de grid com linhas
        // `auto` o h-full do filho colapsa pro tamanho do conteúdo (lista sem scroll,
        // preview sem altura). Forçamos flex-col p/ a altura (92vh) propagar de verdade.
        // [&>button]:hidden: esconde o X padrão do shadcn (o único <button> filho direto)
        // — usamos o nosso próprio X dentro da AuditPage pra não ficarem DOIS X no canto.
        className="max-w-[min(1500px,96vw)] w-[96vw] h-[92vh] p-0 gap-0 overflow-hidden border-border bg-transparent shadow-2xl sm:rounded-2xl !flex !flex-col [&>button]:hidden"
      >
        <DialogTitle className="sr-only">Auditoria de Leads</DialogTitle>
        <div className="flex-1 min-h-0 w-full">
          {open && (
            <AuditPage
              cards={cards}
              sessions={sessions}
              initialStage={initialStage}
              mode={mode}
              embedded
              onClose={() => onOpenChange(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuditModal;
