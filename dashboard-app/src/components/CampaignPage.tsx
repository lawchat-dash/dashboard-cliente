import { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/api/helena';
import { Session, fetchSessionsFromDB } from '@/api/helena';
import { Megaphone, Loader2 } from 'lucide-react';
import CampaignCharts from '@/components/CampaignCharts';
import CampaignFilter from '@/components/CampaignFilter';
import CampaignQualificationCards from '@/components/CampaignQualificationCards';
import CampaignAdRanking from '@/components/CampaignAdRanking';
import CampaignAlerts from '@/components/CampaignAlerts';
import CampaignFunnel from '@/components/CampaignFunnel';
import CampaignHeatmap from '@/components/CampaignHeatmap';
import CampaignConversionTime from '@/components/CampaignConversionTime';
import CampaignComparison from '@/components/CampaignComparison';
import CampaignLeadsTable from '@/components/CampaignLeadsTable';
import MultiTouchAttribution from '@/components/MultiTouchAttribution';
import ABTestAutomatico from '@/components/ABTestAutomatico';
import SalesAgentFAB from '@/components/SalesAgentFAB';

interface CampaignPageProps {
  cards: Card[];
  sessions?: Session[];
}

const CampaignPage = ({ cards, sessions: propSessions }: CampaignPageProps) => {
  const [localSessions, setLocalSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(!propSessions);
  const [selectedCampaign, setSelectedCampaign] = useState('__all__');

  const allSessions = propSessions || localSessions;

  useEffect(() => {
    if (!propSessions) {
      fetchSessionsFromDB()
        .then(setLocalSessions)
        .catch(console.error)
        .finally(() => setLoadingSessions(false));
    }
  }, [propSessions]);

  // Filter sessions to only those linked to the filtered cards (respects date/panel/step filters)
  const cardIdSet = useMemo(() => new Set(cards.map(c => c.id)), [cards]);
  
  const sessions = useMemo(() => {
    return allSessions.filter(s => !s.cardId || cardIdSet.has(s.cardId));
  }, [allSessions, cardIdSet]);

  const filteredSessions = useMemo(() => {
    if (selectedCampaign === '__all__') return sessions;
    return sessions.filter(s => s.utmCampaign === selectedCampaign);
  }, [sessions, selectedCampaign]);

  if (loadingSessions) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando dados de campanhas...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header + Filter */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#8ED393] to-[#15BF41] text-white shadow-sm shadow-emerald-500/20">
              <Megaphone className="h-[18px] w-[18px]" />
            </span>
            Análise de Campanhas
          </h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {sessions.length.toLocaleString('pt-BR')} sessions sincronizadas
            </span>
            <span className="text-muted-foreground/40">·</span>
            Leads com dados UTM reais
          </p>
        </div>
        <CampaignFilter
          sessions={sessions}
          selectedCampaign={selectedCampaign}
          onSelect={setSelectedCampaign}
        />
      </motion.div>

      {/* 2. Cards: Total | Qualificados | Contratos | Desqualificados */}
      <CampaignQualificationCards cards={cards} sessions={filteredSessions} />

      {/* 3. Funil + Ranking lado a lado */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CampaignFunnel cards={cards} sessions={filteredSessions} />
        <CampaignAdRanking cards={cards} sessions={filteredSessions} />
      </div>

      {/* 4. Comparação de Campanhas */}
      <CampaignComparison cards={cards} sessions={sessions} />

      {/* 5. Alertas */}
      <CampaignAlerts cards={cards} sessions={sessions} />

      {/* 6. Tempo Médio + Distribuição por Plataforma */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CampaignConversionTime cards={cards} sessions={sessions} />
        <CampaignCharts cards={cards} sessions={filteredSessions} />
      </div>

      {/* 7. Heatmap */}
      <CampaignHeatmap sessions={filteredSessions} cards={cards} />

      {/* 8. Atribuição Multi-Toque + A/B Test */}
      <div className="grid gap-6 lg:grid-cols-2">
        <MultiTouchAttribution cards={cards} sessions={filteredSessions} />
        <ABTestAutomatico cards={cards} sessions={filteredSessions} />
      </div>

      {/* 9. Leads table */}
      <CampaignLeadsTable cards={cards} sessions={filteredSessions} />

      {/* AI Agent */}
      <SalesAgentFAB />
    </div>
  );
};

export default CampaignPage;
