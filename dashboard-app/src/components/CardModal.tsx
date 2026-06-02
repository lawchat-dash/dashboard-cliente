import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/api/helena';
import { classifyStep } from '@/utils/normalizeStep';
import { extractCampaign } from '@/utils/extractCampaign';
import { formatCurrency, formatDateTime } from '@/utils/formatters';
import { X, User, Phone, Calendar, DollarSign, Megaphone, MessageSquare } from 'lucide-react';
import { useState, useEffect } from 'react';

interface CardModalProps {
  card: Card | null;
  onClose: () => void;
}

function extractName(title: string): string {
  const match = title.match(/👤(.+?)(?:\s*\||\s*📞|$)/);
  return match ? match[1].trim() : title;
}

function extractPhone(title: string): string | null {
  const match = title.match(/📞\s*(.+)/);
  return match ? match[1].trim() : null;
}

const CardModal = ({ card, onClose }: CardModalProps) => {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (card) {
      setShowContent(false);
      const t = setTimeout(() => setShowContent(true), 600);
      return () => clearTimeout(t);
    }
  }, [card]);

  if (!card) return null;

  const step = classifyStep(card.stepTitle);
  const name = card.contacts?.[0]?.name || extractName(card.title);
  const phone = extractPhone(card.title);
  const campaign = extractCampaign(card);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="mx-4 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg"
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                🔑 {card.key}
              </span>
              <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                {card.stepTitle}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                card.isOverdue ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
              }`}>
                {card.isOverdue ? 'Atrasado' : 'Ativo'}
              </span>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!showContent ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-secondary" style={{ width: `${70 + Math.random() * 30}%` }} />
              ))}
            </div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="flex items-center gap-2 text-foreground">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{name}</span>
              </div>
              {phone && (
                <div className="flex items-center gap-2 text-foreground">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{phone}</span>
                </div>
              )}

              <hr className="border-border" />

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Criado em</p>
                  <p className="font-medium text-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {formatDateTime(card.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Responsável</p>
                  <p className="font-medium text-foreground">{card.responsibleUser?.name || 'Não atribuído'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="font-medium text-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {card.monetaryAmount ? formatCurrency(card.monetaryAmount) : 'R$ —'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Prazo</p>
                  <p className="font-medium text-foreground">{card.dueDate ? formatDateTime(card.dueDate) : 'Não definido'}</p>
                </div>
              </div>

              <hr className="border-border" />

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campanha</p>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                  {card.customFields?.['an-ncio'] || 'Sem anúncio'}
                </div>
                {card.customFields?.['texto-campanha'] && (
                  <div className="flex items-start gap-2 text-sm text-foreground">
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                    <span className="italic">"{card.customFields['texto-campanha']}"</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CardModal;
