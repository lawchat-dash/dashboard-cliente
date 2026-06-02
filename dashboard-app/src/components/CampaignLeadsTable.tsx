import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, Session } from '@/api/helena';
import { classifyStep } from '@/utils/normalizeStep';
import { Instagram, Facebook, Globe } from 'lucide-react';

interface CampaignLeadsTableProps {
  cards: Card[];
  sessions: Session[];
}

const SourceIcon = ({ source }: { source: string }) => {
  const s = source?.toUpperCase() || '';
  if (s.includes('INSTAGRAM')) return <Instagram className="h-3.5 w-3.5 text-pink-500" />;
  if (s.includes('FACEBOOK')) return <Facebook className="h-3.5 w-3.5 text-blue-500" />;
  return <Globe className="h-3.5 w-3.5 text-muted-foreground" />;
};

const CampaignLeadsTable = ({ cards, sessions }: CampaignLeadsTableProps) => {
  const leads = useMemo(() => {
    const cardMap = new Map(cards.filter(c => !c.archived).map(c => [c.id, c]));
    const sessionsWithUtm = sessions.filter(s => s.utmCampaign || s.utmSource);

    return sessionsWithUtm.map(s => {
      const card = cardMap.get(s.cardId);
      return {
        name: s.contactName || card?.contacts?.[0]?.name || card?.title || '—',
        key: card?.key || s.id,
        step: card ? classifyStep(card.stepTitle) : '—',
        utmSource: s.utmSource || '—',
        utmCampaign: s.utmCampaign || '—',
        createdAt: s.sessionCreatedAt
          ? new Date(s.sessionCreatedAt).toLocaleDateString('pt-BR')
          : '—',
      };
    });
  }, [cards, sessions]);

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-card">
        Nenhum lead com dados UTM encontrado.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Leads por Campanha</h3>
        <p className="text-xs text-muted-foreground">{leads.length} leads com dados UTM</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium">Etapa</th>
              <th className="px-4 py-3 font-medium">Origem</th>
              <th className="px-4 py-3 font-medium">Campanha</th>
              <th className="px-4 py-3 font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {leads.slice(0, 50).map((lead, i) => (
              <motion.tr
                key={lead.key + '-' + i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.01 }}
                className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-2.5 font-medium text-foreground">{lead.name}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {lead.step}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-foreground">
                    <SourceIcon source={lead.utmSource} />
                    {lead.utmSource}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate" title={lead.utmCampaign}>
                  {lead.utmCampaign}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{lead.createdAt}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {leads.length > 50 && (
        <div className="px-4 py-2 text-center text-xs text-muted-foreground border-t border-border">
          Mostrando 50 de {leads.length} leads
        </div>
      )}
    </div>
  );
};

export default CampaignLeadsTable;
