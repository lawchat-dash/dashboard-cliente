import { useState, useMemo, useCallback } from 'react';
import { Card, Session } from '@/api/helena';
import { classifyStep } from '@/utils/normalizeStep';
import { StepMappingsMap } from '@/hooks/useStepMappings';

// Dynamic panel options derived from actual card data.
// allowedPanels (config do cliente no admin): se preenchido, só mostra esses painéis.
export function buildPanelOptions(cards: Card[], allowedPanels?: string[]): { id: string; name: string }[] {
  const allow = allowedPanels && allowedPanels.length > 0 ? new Set(allowedPanels) : null;
  const panelMap = new Map<string, string>();
  cards.forEach(c => {
    if (c.panelId && c.panelTitle && !panelMap.has(c.panelId)) {
      if (allow && !allow.has(c.panelId)) return;
      panelMap.set(c.panelId, c.panelTitle);
    }
  });
  return [
    { id: '__all__', name: 'Todos os Painéis' },
    ...Array.from(panelMap.entries()).map(([id, name]) => ({ id, name })),
  ];
}

export interface Filters {
  dateStart: string;
  dateEnd: string;
  dateMode: 'creation' | 'update';
  steps: string[];
  responsible: string[];
  channelNumbers: string[];
  tags: string[];
  leadSource: string;
  panelId: string;
  panelIds: string[];
  campaign: string;
}

const initialFilters: Filters = {
  dateStart: '',
  dateEnd: '',
  dateMode: 'creation',
  steps: [],
  responsible: [],
  channelNumbers: [],
  tags: [],
  leadSource: '',
  panelId: '__all__',
  panelIds: [],
  campaign: '__all__',
};

function extractHumanId(session: Session): string | null {
  try {
    const detail = session.sessionDetailFull;
    if (detail && typeof detail === 'object') {
      const channelDetails = (detail as any).channelDetails;
      if (channelDetails && channelDetails.humanId) {
        return channelDetails.humanId;
      }
    }
  } catch {}
  return null;
}

export function useFilters(cards: Card[], sessions: Session[], stepMappings?: StepMappingsMap, allowedNumbers?: string[], allowedPanels?: string[]) {
  const allowedPanelSet = useMemo(() => (allowedPanels && allowedPanels.length > 0 ? new Set(allowedPanels) : null), [allowedPanels]);
  const [filters, setFilters] = useState<Filters>(initialFilters);

  const panelOptions = useMemo(() => buildPanelOptions(cards, allowedPanels), [cards, allowedPanels]);

  const classify = useCallback((card: Card) => classifyStep(card.stepTitle, card.stepId, stepMappings), [stepMappings]);

  const sessionsByCardId = useMemo(() => {
    const map = new Map<string, Session[]>();
    sessions.forEach((s) => {
      if (!s.cardId) return;
      const list = map.get(s.cardId) || [];
      list.push(s);
      map.set(s.cardId, list);
    });
    return map;
  }, [sessions]);

  const allowedSet = useMemo(() => {
    if (!allowedNumbers || allowedNumbers.length === 0) return null;
    return new Set(allowedNumbers.map(String));
  }, [allowedNumbers]);

  const uniqueChannelNumbers = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      const hid = extractHumanId(s);
      if (hid && (!allowedSet || allowedSet.has(hid))) set.add(hid);
    });
    return Array.from(set).sort();
  }, [sessions, allowedSet]);

  const uniqueResponsibles = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      if (s.agentName) set.add(s.agentName);
    });
    cards.forEach((c) => {
      const cardSessions = sessionsByCardId.get(c.id);
      if (!cardSessions || cardSessions.length === 0) {
        set.add(c.responsibleUser?.name || 'Não atribuído');
      }
    });
    return Array.from(set).sort();
  }, [sessions, cards, sessionsByCardId]);

  // Tags de contato agora vêm da coluna dedicada contact_tag_names (enriquecida via bulk de contatos).
  // Usamos o próprio nome como id (não temos tagId separado nessa via, e o filtro funciona por nome).
  const contactTagMap = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => {
      (s.contactTagNames || []).forEach((name) => { if (!map.has(name)) map.set(name, name); });
    });
    return map;
  }, [sessions]);

  // Map cardId -> contact tag names (from sessions)
  const cardContactTags = useMemo(() => {
    const map = new Map<string, Set<string>>();
    sessions.forEach((s) => {
      if (!s.cardId) return;
      const names = s.contactTagNames || [];
      if (names.length === 0) return;
      const existing = map.get(s.cardId) || new Set<string>();
      names.forEach((name) => existing.add(name));
      map.set(s.cardId, existing);
    });
    return map;
  }, [sessions]);

  // Unique contact tags with names
  const uniqueTags = useMemo(() => {
    return Array.from(contactTagMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contactTagMap]);

  // Lead source classification from utmSource — aligned with BestAdsRanking
  const classifySource = (utmSource: string | null | undefined): string => {
    const src = (utmSource || '').toUpperCase();
    if (src.includes('INSTAGRAM')) return 'Instagram';
    if (src.includes('FACEBOOK') || src.includes('META')) return 'Facebook / Meta';
    if (src.includes('GOOGLE')) return 'Google Ads';
    if (src.includes('YOUTUBE')) return 'YouTube';
    if (src) return 'Outro';
    return 'Outro';
  };

  const uniqueLeadSources = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => {
      // Only consider sessions with utmSource AND (utmSourceId or utmCampaign) — same as BestAdsRanking
      if (s.utmSource && (s.utmSourceId || s.utmCampaign)) {
        set.add(classifySource(s.utmSource));
      }
    });
    return Array.from(set).sort();
  }, [sessions]);

  const cardIdsForLeadSource = useMemo(() => {
    if (!filters.leadSource) return null;
    const seenCards = new Set<string>();
    const ids = new Set<string>();
    sessions.forEach(s => {
      if (!s.cardId || seenCards.has(s.cardId)) return;
      // Only consider sessions with utmSource AND (utmSourceId or utmCampaign)
      if (s.utmSource && (s.utmSourceId || s.utmCampaign)) {
        seenCards.add(s.cardId);
        if (classifySource(s.utmSource) === filters.leadSource) {
          ids.add(s.cardId);
        }
      }
    });
    return ids;
  }, [sessions, filters.leadSource]);

  // Build a set of card IDs that have ANY session (used for fallback)
  const cardIdsWithSessions = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => { if (s.cardId) set.add(s.cardId); });
    return set;
  }, [sessions]);

  const cardIdsForChannel = useMemo(() => {
    // IMPORTANTE: allowed_numbers NÃO filtra mais o dashboard automaticamente.
    // O client_id já isola o cliente; usar allowed_numbers como gate escondia
    // milhares de cards (sessões em outros números) → mostrava 2.896 em vez de 13.994.
    // O filtro de número só vale quando o usuário escolhe um número na UI.
    const selected = filters.channelNumbers && filters.channelNumbers.length > 0 ? new Set(filters.channelNumbers) : null;
    if (!selected) return null;
    const ids = new Set<string>();
    sessions.forEach((s) => {
      if (!s.cardId) return;
      const hid = extractHumanId(s);
      if (!hid || !selected.has(hid)) return;
      ids.add(s.cardId);
    });
    return ids;
  }, [sessions, filters.channelNumbers]);

  // Campaign filter: build set of card IDs that belong to the selected campaign
  const cardIdsForCampaign = useMemo(() => {
    if (!filters.campaign || filters.campaign === '__all__') return null;
    const ids = new Set<string>();
    sessions.forEach(s => {
      if (s.cardId && s.utmCampaign === filters.campaign) {
        ids.add(s.cardId);
      }
    });
    return ids;
  }, [sessions, filters.campaign]);

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      // Panel filter
      // Restrição de painéis (config admin): esconde cards de painéis não liberados.
      if (allowedPanelSet && card.panelId && !allowedPanelSet.has(card.panelId)) return false;
      // Filtro de painel multi-seleção (escolha do usuário na UI).
      if (filters.panelIds && filters.panelIds.length > 0) {
        if (!card.panelId || !filters.panelIds.includes(card.panelId)) return false;
      } else if (filters.panelId !== '__all__' && card.panelId !== filters.panelId) return false;

      const rawDate = filters.dateMode === 'update' ? card.updatedAt : card.createdAt;
      const cardDate = new Date(rawDate);
      const cardLocalDate = `${cardDate.getFullYear()}-${String(cardDate.getMonth() + 1).padStart(2, '0')}-${String(cardDate.getDate()).padStart(2, '0')}`;

      if (filters.dateStart && cardLocalDate < filters.dateStart) return false;
      if (filters.dateEnd && cardLocalDate > filters.dateEnd) return false;

      if (filters.steps.length > 0) {
        if (!filters.steps.includes(classify(card))) return false;
      }

      // Filtro de número/canal:
      // - Seleção EXPLÍCITA de número (UI) → estrito: esconde quem não bate.
      // - allowed_numbers (multi-tenant) → NÃO esconde cards sem sessão sincronizada
      //   (o client_id já isola o cliente; sessão pode só não ter sido sincronizada ainda).
      if (cardIdsForChannel && !cardIdsForChannel.has(card.id)) {
        const explicitChannel = filters.channelNumbers && filters.channelNumbers.length > 0;
        if (explicitChannel || cardIdsWithSessions.has(card.id)) return false;
      }

      // Lead source filter
      if (cardIdsForLeadSource && !cardIdsForLeadSource.has(card.id)) return false;

      // Campaign filter
      if (cardIdsForCampaign && !cardIdsForCampaign.has(card.id)) return false;

      // Tag filter (using contact tags from sessions)
      if (filters.tags.length > 0) {
        const contactTags = cardContactTags.get(card.id);
        if (!contactTags || !filters.tags.some(t => contactTags.has(t))) return false;
      }

      if (filters.responsible.length > 0) {
        const cardSessions = sessionsByCardId.get(card.id);
        let responsibleName: string;
        if (cardSessions && cardSessions.length > 0) {
          const agentNames = cardSessions
            .map((s) => s.agentName)
            .filter(Boolean) as string[];
          responsibleName = agentNames.length > 0 ? agentNames[0] : (card.responsibleUser?.name || 'Não atribuído');
        } else {
          responsibleName = card.responsibleUser?.name || 'Não atribuído';
        }
        if (!filters.responsible.includes(responsibleName)) return false;
      }

      return true;
    });
  }, [cards, filters, allowedPanelSet, cardIdsForChannel, cardIdsWithSessions, cardIdsForLeadSource, cardIdsForCampaign, sessionsByCardId, cardContactTags, classify]);

  const clearFilters = useCallback(() => setFilters(initialFilters), []);

  return { filters, setFilters, filteredCards, clearFilters, uniqueResponsibles, uniqueChannelNumbers, uniqueTags, contactTagMap, uniqueLeadSources, panelOptions };
}
