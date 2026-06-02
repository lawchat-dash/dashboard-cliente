import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { FUNNEL_STEPS, getStepDisplayName } from '@/utils/normalizeStep';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { ChevronDown, Search, Download } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';

interface LeadsTableProps {
  cards: Card[];
  onCardClick: (card: Card) => void;
}

function extractName(title: string): string {
  const match = title.match(/👤(.+?)(?:\s*\||\s*📞|$)/);
  return match ? match[1].trim() : title;
}

const LeadsTable = ({ cards, onCardClick }: LeadsTableProps) => {
  const { classify } = useClassify();
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const map = new Map<string, Card[]>();
    const allSteps = [...FUNNEL_STEPS];
    allSteps.forEach(s => map.set(s, []));

    cards.filter(c => !c.archived).forEach(c => {
      const step = classify(c);
      if (!map.has(step)) map.set(step, []);
      map.get(step)!.push(c);
    });

    return Array.from(map.entries()).filter(([, v]) => v.length > 0);
  }, [cards, classify]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="text-lg font-semibold text-foreground">Leads por Etapa</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const headers = ['Etapa', 'Chave', 'Nome', 'Responsável', 'Valor', 'Data'];
              const rows: string[][] = [];
              grouped.forEach(([step, stepCards]) => {
                stepCards.forEach(card => {
                  rows.push([
                    getStepDisplayName(step),
                    card.key,
                    extractName(card.title),
                    card.responsibleUser?.name || '',
                    card.monetaryAmount ? String(card.monetaryAmount) : '',
                    formatDate(card.createdAt),
                  ]);
                });
              });
              exportToCsv('leads.csv', headers, rows);
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-lg px-3 py-1.5 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar lead..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {grouped.map(([step, stepCards]) => {
        const filtered = stepCards.filter(c => {
          if (!search) return true;
          const q = search.toLowerCase();
          return c.title.toLowerCase().includes(q) ||
            c.key.toLowerCase().includes(q) ||
            c.contacts?.some(ct => ct.name.toLowerCase().includes(q));
        });

        if (search && filtered.length === 0) return null;

        return (
          <div key={step} className="border-b border-border/50 last:border-0">
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/50"
              onClick={() => setExpandedStep(expandedStep === step ? null : step)}
            >
              <span>{getStepDisplayName(step)} ({filtered.length})</span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${expandedStep === step ? 'rotate-180' : ''}`}
              />
            </button>
            <AnimatePresence>
              {expandedStep === step && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary/30 text-xs text-muted-foreground">
                        <th className="px-4 py-2 text-left font-medium">Chave</th>
                        <th className="px-4 py-2 text-left font-medium">Nome</th>
                        <th className="px-4 py-2 text-left font-medium">Responsável</th>
                        <th className="px-4 py-2 text-right font-medium">Valor</th>
                        <th className="px-4 py-2 text-right font-medium">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(card => (
                        <tr
                          key={card.id}
                          className="cursor-pointer border-b border-border/30 transition-colors hover:bg-secondary/30 last:border-0"
                          onClick={() => onCardClick(card)}
                        >
                          <td className="px-4 py-2 font-mono text-xs text-primary">{card.key}</td>
                          <td className="px-4 py-2 font-medium text-foreground">{extractName(card.title)}</td>
                          <td className="px-4 py-2 text-muted-foreground">{card.responsibleUser?.name || '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-foreground">
                            {card.monetaryAmount ? formatCurrency(card.monetaryAmount) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{formatDate(card.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};

export default LeadsTable;
