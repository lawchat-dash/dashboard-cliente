import { useEffect, useState, useMemo, useCallback } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { AnimatePresence, motion } from 'framer-motion';
import { useCards } from '@/hooks/useCards';
import { useFilters } from '@/hooks/useFilters';
import { useStepMappings } from '@/hooks/useStepMappings';
import { StepMappingsProvider } from '@/contexts/StepMappingsContext';
import { Card as HelenaCard, Session, fetchSessionsFromDB, fetchCounts, triggerSessionsSync } from '@/api/helena';
import { cacheGet, cacheSet, sessionsKey } from '@/utils/dashboardCache';
import LastUpdatedBadge from '@/components/LastUpdatedBadge';
import LoadingScreen from '@/components/LoadingScreen';
import FiltersBar from '@/components/FiltersBar';
import KPICards from '@/components/KPICards';
import StageMetrics from '@/components/StageMetrics';
import AverageTimeCards from '@/components/AverageTimeCards';
import VolumePanel from '@/components/VolumePanel';
import SalesFunnel from '@/components/SalesFunnel';
import LeadsTable from '@/components/LeadsTable';
import TimelineChart from '@/components/TimelineChart';
import LeadSourceChart from '@/components/LeadSourceChart';
import SalesGoal from '@/components/SalesGoal';
import BestAdsRanking from '@/components/BestAdsRanking';
import BrazilStateMap from '@/components/BrazilStateMap';
import CardModal from '@/components/CardModal';
import Sidebar from '@/components/Sidebar';
import { Routes, Route, useLocation } from 'react-router-dom';
import CampaignPage from '@/components/CampaignPage';
import PipelinePage from '@/components/PipelinePage';
import AuditPage from '@/components/AuditPage';
import { FileDown, X } from 'lucide-react';
import SalesAgentFAB from '@/components/SalesAgentFAB';
import LiveChatPage from '@/components/LiveChatPage';
import ContractsPage from '@/components/ContractsPage';
import ChatEvolutionPage from '@/components/ChatEvolutionPage';
import GlobalSearch from '@/components/GlobalSearch';
import PeriodComparison from '@/components/PeriodComparison';
import PresentationMode from '@/components/PresentationMode';
import FollowUpPage from '@/components/FollowUpPage';
import NotificationsPage from '@/components/NotificationsPage';
import SupervisionPage from '@/components/SupervisionPage';
import AlertSummaryCard from '@/components/AlertSummaryCard';
import { SPLIT_PAGES } from '@/components/SplitScreenButton';


import { ClientFeatures } from '@/hooks/useClient';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface IndexProps {
  clientId?: string;
  clientName?: string;
  features?: ClientFeatures;
  basePath?: string;
  embedded?: boolean;
  allowedNumbers?: string[];
  allowedPanels?: string[];
}

const Index = ({ clientId, clientName, features, basePath = '', embedded = false, allowedNumbers, allowedPanels }: IndexProps) => {
  const location = useLocation();
  const { cards, loading, lastUpdated, loadCards, refreshCards, silentRefresh } = useCards(clientId);
  const currentUser = useCurrentUser(clientId);
  const [selectedCard, setSelectedCard] = useState<HelenaCard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsReady, setSessionsReady] = useState(false);
  // Totais (COUNT) para a % REAL da tela de carregamento
  const [cardsTotal, setCardsTotal] = useState(0);
  const [sessTotal, setSessTotal] = useState(0);
  const [splitPages, setSplitPages] = useState<string[]>([]);
  const { mappings: stepMappings } = useStepMappings(clientId);
  const { filters, setFilters, filteredCards, clearFilters, uniqueResponsibles, uniqueChannelNumbers, uniqueTags, uniqueLeadSources, panelOptions } = useFilters(cards, sessions, stepMappings, allowedNumbers, allowedPanels);

  // 1. Inicial: carrega cards + sessions — CACHE PRIMEIRO (IndexedDB).
  //    Se já tem cache, abre instantâneo e atualiza em 2º plano; se o Supabase
  //    estiver lento/saturado, o cache segura a tela (sem "0", sem loop).
  useEffect(() => {
    loadCards();
    let done = false;
    let hadSessCache = false;
    let cachedSessLen = 0;
    const markReady = () => { if (!done) { done = true; setSessionsReady(true); } };

    (async () => {
      // cache de sessões primeiro
      try {
        const c = await cacheGet<{ sessions: Session[] }>(sessionsKey(clientId));
        if (c?.sessions?.length) { setSessions(c.sessions); cachedSessLen = c.sessions.length; hadSessCache = true; markReady(); }
      } catch {}

      // totais p/ % real (só relevante na 1ª carga, sem cache)
      fetchCounts(clientId).then(c => { setCardsTotal(c.cards); setSessTotal(c.sessions); }).catch(() => {});

      // fetch fresco (2º plano se já havia cache)
      fetchSessionsFromDB(clientId, (partial) => { if (!hadSessCache) setSessions(partial); })
        .then((s) => {
          if (s.length > 0 && (!hadSessCache || s.length >= cachedSessLen * 0.8)) {
            setSessions(s); cacheSet(sessionsKey(clientId), { sessions: s });
          }
          markReady();
        })
        .catch((e) => { console.error(e); markReady(); });
    })();

    const cap = setTimeout(markReady, 180000);
    return () => clearTimeout(cap);
  }, [loadCards, clientId]);

  // 2. Sincronização é 100% responsabilidade do CRON do servidor (horário/noturno).
  //    NÃO disparamos sync ao ABRIR o dashboard — isso martelava o banco a cada
  //    reload (sync escrevendo + re-fetch lendo) e causava timeout no carregamento
  //    ("às vezes funcionava, às vezes não"). Aqui só RELEMOS, de tempos em tempos,
  //    o que o cron já gravou no banco — leitura leve, sem flash, sem sync.
  useEffect(() => {
    if (!clientId) return;
    const REFRESH_MS = 15 * 60 * 1000;
    const interval = setInterval(() => {
      silentRefresh().catch(console.error);
      fetchSessionsFromDB(clientId).then(setSessions).catch(console.error);
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [clientId, silentRefresh]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshCards();
    if (!clientId) triggerSessionsSync().catch(console.error);
    fetchSessionsFromDB(clientId).then(setSessions).catch(console.error);
    setRefreshing(false);
  };

  const handleExportPDF = () => { window.print(); };

  // Espera TODOS os dados (cards + sessões) antes de abrir o dashboard — sem
  // dados parciais. Confiável porque o sync-on-mount (que competia pelo banco)
  // agora só roda DEPOIS do load terminar (ver Effect 2). % real = carregados ÷ total.
  const bootTotal = cardsTotal + sessTotal;
  const bootLoaded = cards.length + sessions.length;
  const bootPct = bootTotal > 0 ? Math.min(100, (bootLoaded / bootTotal) * 100) : undefined;
  const bootDetail = bootTotal > 0 ? `${bootLoaded.toLocaleString('pt-BR')} de ${bootTotal.toLocaleString('pt-BR')} registros` : null;
  if (loading || !sessionsReady) {
    return <LoadingScreen userName={currentUser.agent?.name} progress={bootPct} detail={bootDetail} />;
  }

  const renderSplitContent = (pageKey: string) => {
    switch (pageKey) {
      case 'dashboard':
        return (
          <div className="space-y-5">
            {(!features || features.ao_vivo !== false) && <AlertSummaryCard clientId={clientId} />}
            <KPICards cards={filteredCards} sessions={sessions} />
            <StageMetrics cards={filteredCards} sessions={sessions} />
            <div className="grid items-stretch gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3"><SalesFunnel cards={filteredCards} activeSteps={filters.steps} /></div>
              <div className="lg:col-span-2"><BestAdsRanking sessions={sessions} cards={filteredCards} /></div>
            </div>
            <div className="grid items-stretch gap-5 lg:grid-cols-2">
              <AverageTimeCards cards={filteredCards} />
              <SalesGoal cards={filteredCards} />
            </div>
            <TimelineChart cards={filteredCards} />
            <div className="grid items-start gap-5 lg:grid-cols-3">
              <VolumePanel cards={filteredCards} />
              <LeadSourceChart sessions={sessions} cards={filteredCards} />
              <BrazilStateMap sessions={sessions} cards={filteredCards} />
            </div>
            <LeadsTable cards={filteredCards} onCardClick={setSelectedCard} />
          </div>
        );
      case 'campanhas':
        return <CampaignPage cards={filteredCards} sessions={sessions} />;
      case 'pipeline':
        return <PipelinePage cards={filteredCards} sessions={sessions} />;
      case 'auditoria':
        return <AuditPage cards={filteredCards} sessions={sessions} />;
      case 'ao-vivo':
        return <LiveChatPage clientId={clientId} />;
      case 'contratos':
        return <ContractsPage cards={filteredCards} sessions={sessions} />;
      case 'evolucao':
        return <ChatEvolutionPage cards={filteredCards} sessions={sessions} />;
      case 'comparar':
        return <PeriodComparison cards={filteredCards} sessions={sessions} />;
      case 'follow-up':
        return <FollowUpPage cards={filteredCards} sessions={sessions} clientId={clientId} features={features} dateStart={filters.dateStart} dateEnd={filters.dateEnd} />;
      case 'notificacoes':
        return <NotificationsPage clientId={clientId} currentUserName={currentUser.agent?.name || null} currentUserHelenaId={currentUser.helenaUserId} />;
      case 'supervisao':
        return <SupervisionPage clientId={clientId} />;
      default:
        return null;
    }
  };

  // Saudação dinâmica baseada na hora
  const greetHour = new Date().getHours();
  const greetEmoji = greetHour < 6 ? '🌙' : greetHour < 12 ? '☀️' : greetHour < 18 ? '👋' : '🌆';
  const greetText = greetHour < 6 ? 'Boa madrugada' : greetHour < 12 ? 'Bom dia' : greetHour < 18 ? 'Boa tarde' : 'Boa noite';
  const displayName = currentUser.agent?.name || clientName || 'Time';

  const mainContent = (
    <main className="mx-auto w-[98%] max-w-[1600px] space-y-5 py-4 md:py-5">
      {/* Saudação top-bar — SÓ no dashboard principal */}
      {(location.pathname === basePath || location.pathname === basePath + '/') && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="print:hidden flex items-center justify-between gap-4 pb-1"
        >
          <div>
            <h1 className="flex items-center gap-2 text-2xl md:text-[26px] font-bold tracking-tight text-foreground">
              {greetText}, {displayName}! <span className="inline-block animate-[wiggle_2s_ease-in-out_infinite]">{greetEmoji}</span>
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Aqui está o desempenho de {filters.dateStart === filters.dateEnd ? 'hoje' : 'do período'}
            </p>
          </div>
          <LastUpdatedBadge date={lastUpdated} onRefresh={handleRefresh} refreshing={refreshing} />
        </motion.div>
      )}

      {!location.pathname.endsWith('/ao-vivo') && !location.pathname.endsWith('/follow-up') && !location.pathname.endsWith('/notificacoes') && !location.pathname.endsWith('/supervisao') && (
        <div className="print:hidden">
          <FiltersBar
            filters={filters}
            setFilters={setFilters}
            clearFilters={clearFilters}
            uniqueResponsibles={uniqueResponsibles}
            uniqueChannelNumbers={uniqueChannelNumbers}
            uniqueTags={uniqueTags}
            uniqueLeadSources={uniqueLeadSources}
            sessions={sessions}
            onRefresh={handleRefresh}
            isRefreshing={refreshing}
            panelOptions={panelOptions}
            // Dashboard principal = aberto; demais abas = minimizado por padrão
            defaultCollapsed={!(location.pathname === basePath || location.pathname === basePath + '/')}
          />
        </div>
      )}

      <Routes>
        <Route
          path="/"
          element={
            <div className="space-y-5">
              {(!features || features.ao_vivo !== false) && (
                <AlertSummaryCard clientId={clientId} />
              )}
              <KPICards cards={filteredCards} sessions={sessions} />
              <StageMetrics cards={filteredCards} sessions={sessions} />
              <div className="grid items-start gap-5 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  <SalesFunnel cards={filteredCards} activeSteps={filters.steps} />
                </div>
                <div className="lg:col-span-2">
                  <BestAdsRanking sessions={sessions} cards={filteredCards} />
                </div>
              </div>
              <div className="grid items-stretch gap-5 lg:grid-cols-2">
                <AverageTimeCards cards={filteredCards} />
                <SalesGoal cards={filteredCards} />
              </div>
              <TimelineChart cards={filteredCards} />
              <div className="grid items-start gap-5 lg:grid-cols-3">
                <VolumePanel cards={filteredCards} />
                <LeadSourceChart sessions={sessions} cards={filteredCards} />
                <BrazilStateMap sessions={sessions} cards={filteredCards} />
              </div>
              {features?.ia && <SalesAgentFAB clientId={clientId} />}
              <LeadsTable cards={filteredCards} onCardClick={setSelectedCard} />
              <div className="flex justify-center pb-4 print:hidden">
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-medium text-foreground shadow-card transition-colors hover:bg-secondary hover:shadow-card-hover"
                >
                  <FileDown className="h-4 w-4 text-primary" />
                  Exportar Relatório em PDF
                </button>
              </div>
            </div>
          }
        />
        {(!features || features.campanhas !== false) && (
          <Route path="/campanhas" element={<CampaignPage cards={filteredCards} sessions={sessions} />} />
        )}
        {(!features || features.pipeline !== false) && (
          <Route path="/pipeline" element={<PipelinePage cards={filteredCards} sessions={sessions} />} />
        )}
        {(!features || features.auditoria !== false) && (
          <Route path="/auditoria" element={<AuditPage cards={filteredCards} sessions={sessions} />} />
        )}
        {(!features || features.ao_vivo !== false) && (
          <Route path="/ao-vivo" element={<LiveChatPage clientId={clientId} />} />
        )}
        {(!features || features.contratos !== false) && (
          <Route path="/contratos" element={<ContractsPage cards={filteredCards} sessions={sessions} />} />
        )}
        {(!features || features.evolucao !== false) && (
          <Route path="/evolucao" element={<ChatEvolutionPage cards={filteredCards} sessions={sessions} />} />
        )}
        {(!features || features.comparar !== false) && (
          <Route path="/comparar" element={<PeriodComparison cards={filteredCards} sessions={sessions} />} />
        )}
        {(!features || features.follow_up !== false) && (
          <Route path="/follow-up" element={<FollowUpPage cards={filteredCards} sessions={sessions} clientId={clientId} features={features} dateStart={filters.dateStart} dateEnd={filters.dateEnd} />} />
        )}
        {(!features || features.notificacoes !== false) && (
          <Route path="/notificacoes" element={<NotificationsPage clientId={clientId} currentUserName={currentUser.agent?.name || null} currentUserHelenaId={currentUser.helenaUserId} />} />
        )}
        <Route path="/supervisao" element={<SupervisionPage clientId={clientId} />} />
      </Routes>
    </main>
  );

  return (
    <StepMappingsProvider clientId={clientId}>
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`flex ${embedded ? 'min-h-[600px]' : 'min-h-screen'} bg-background overflow-x-hidden`}
      >
        <Sidebar features={features} basePath={basePath} clientId={clientId} lastUpdated={lastUpdated} currentUserName={currentUser.agent?.name} currentUserProfile={currentUser.agent?.profile} splitPages={splitPages} onSplitConfirm={setSplitPages} onSplitClose={() => setSplitPages([])} />

        <GlobalSearch cards={filteredCards} sessions={sessions} basePath={basePath} onSelectCard={setSelectedCard} />
        <PresentationMode cards={filteredCards} sessions={sessions} clientName={clientName} />

        {splitPages.length >= 2 ? (
          <div className={`flex-1 flex min-w-0 ${embedded ? '' : 'h-screen'} relative`}>
            <ResizablePanelGroup direction="horizontal" className="flex-1">
              {splitPages.map((pageKey, idx) => {
                const page = SPLIT_PAGES.find(p => p.key === pageKey);
                return (
                  <ResizablePanel key={pageKey} defaultSize={Math.floor(100 / splitPages.length)} minSize={20}>
                    <div className="flex flex-col h-full">
                      {/* Panel header */}
                      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 shrink-0">
                        <div className="flex items-center gap-2">
                          {page && (() => {
                            const Icon = page.icon;
                            return (
                              <>
                                <Icon className="h-4 w-4 text-primary" />
                                <span className="text-sm font-semibold text-foreground">{page.label}</span>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      {/* Panel content */}
                      <div className="flex-1 overflow-y-auto">
                        <div className="mx-auto w-[98%] max-w-[1600px] space-y-5 py-4">
                          {renderSplitContent(pageKey)}
                        </div>
                      </div>
                    </div>
                  </ResizablePanel>
                );
              }).reduce<React.ReactNode[]>((acc, panel, idx) => {
                if (idx > 0) acc.push(<ResizableHandle key={`handle-${idx}`} withHandle />);
                acc.push(panel);
                return acc;
              }, [])}
            </ResizablePanelGroup>
            {/* Close button floating */}
            <button
              onClick={() => setSplitPages([])}
              className="absolute top-3 right-3 z-50 flex items-center justify-center h-8 w-8 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors shadow-md"
              title="Sair do modo dividido"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className={`flex-1 overflow-y-auto min-w-0 ${embedded ? '' : 'h-screen'}`}>
            {mainContent}
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {selectedCard && (
          <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
        )}
      </AnimatePresence>
    </>
    </StepMappingsProvider>
  );
};

export default Index;
