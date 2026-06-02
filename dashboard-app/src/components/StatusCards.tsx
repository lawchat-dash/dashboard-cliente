import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/api/helena';
import { Sparkles, CheckCircle, Users } from 'lucide-react';

interface StatusCardsProps {
  cards: Card[];
}

const StatusCards = ({ cards }: StatusCardsProps) => {
  const data = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const monthAgo = new Date(today.getTime() - 30 * 86400000);

    const nonArchived = cards.filter(c => !c.archived);
    const createdToday = cards.filter(c => new Date(c.createdAt) >= today).length;
    const createdWeek = cards.filter(c => new Date(c.createdAt) >= weekAgo).length;
    const createdMonth = cards.filter(c => new Date(c.createdAt) >= monthAgo).length;

    const active = nonArchived.filter(c => !c.isOverdue && c.stepPhase !== 'WON' && c.stepPhase !== 'LOST').length;
    const overdue = nonArchived.filter(c => c.isOverdue).length;
    const archived = cards.filter(c => c.archived).length;

    const totalContacts = cards.reduce((sum, c) => sum + c.contactIds.length, 0);
    const cardsWithContacts = cards.filter(c => c.contactIds.length > 0).length;
    const uniqueResponsibles = new Set(cards.map(c => c.responsibleUser?.name).filter(Boolean)).size;

    return {
      creation: [
        { label: 'Hoje', value: createdToday },
        { label: 'Esta Semana', value: createdWeek },
        { label: 'Este Mês', value: createdMonth },
      ],
      status: [
        { label: 'Ativos', value: active, variant: 'default' as const },
        { label: 'Atrasados', value: overdue, variant: 'danger' as const },
        { label: 'Arquivados', value: archived, variant: 'default' as const },
      ],
      contacts: [
        { label: 'Total de Contatos', value: totalContacts },
        { label: 'Cards com Contatos', value: cardsWithContacts },
        { label: 'Responsáveis Únicos', value: uniqueResponsibles },
      ],
    };
  }, [cards]);

  const sections = [
    { title: 'Criação de Cards', icon: Sparkles, items: data.creation },
    { title: 'Status dos Cards', icon: CheckCircle, items: data.status },
    { title: 'Contatos e Comunicação', icon: Users, items: data.contacts },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {sections.map((section, si) => (
        <motion.div
          key={section.title}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: si * 0.08 }}
          className="rounded-lg border border-border bg-card p-5 shadow-card"
        >
          <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <section.icon className="h-4 w-4 text-muted-foreground" />
            {section.title}
          </h4>
          <div className="space-y-3">
            {section.items.map((item: any) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span
                  className={`inline-flex min-w-[2rem] items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    item.variant === 'danger'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-secondary text-foreground'
                  }`}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default StatusCards;
