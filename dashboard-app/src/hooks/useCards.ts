import { useState, useCallback, useRef } from 'react';
import { Card, fetchCardsFromDB, triggerSync, fetchAllCards } from '@/api/helena';
import { cacheGet, cacheSet, cardsKey } from '@/utils/dashboardCache';

const LOAD_TIMEOUT_MS = 180000; // teto de segurança p/ a 1ª carga (sem cache)

export function useCards(clientId?: string) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cachedLenRef = useRef(0);

  const loadCards = useCallback(async () => {
    setLoading(true);
    cachedLenRef.current = 0;
    let hadCache = false;

    // 1) CACHE PRIMEIRO → dashboard abre INSTANTÂNEO com o que já tínhamos.
    try {
      const c = await cacheGet<{ cards: Card[]; syncedAt: string | null }>(cardsKey(clientId));
      if (c?.cards?.length) {
        setCards(c.cards);
        setLastUpdated(c.syncedAt ? new Date(c.syncedAt) : new Date());
        cachedLenRef.current = c.cards.length;
        setLoading(false);   // não segura a tela — já temos dados
        hadCache = true;
      }
    } catch {}

    timeoutRef.current = setTimeout(() => setLoading(false), LOAD_TIMEOUT_MS);

    // 2) FETCH FRESCO (em 2º plano se já havia cache).
    try {
      const { cards: dbCards, syncedAt } = await fetchCardsFromDB(clientId, (partial, sa) => {
        // Atualiza a % incremental SÓ na 1ª carga (sem cache). Com cache, mantém
        // os dados completos na tela em vez de resetar pra uma página parcial.
        if (!hadCache) { setCards(partial); if (sa) setLastUpdated(new Date(sa)); }
      });

      if (dbCards.length > 0) {
        // Não troca um cache BOM por um fetch incompleto (DB lento → parcial).
        if (!hadCache || dbCards.length >= cachedLenRef.current * 0.8) {
          setCards(dbCards);
          setLastUpdated(syncedAt ? new Date(syncedAt) : new Date());
          cacheSet(cardsKey(clientId), { cards: dbCards, syncedAt });
        }
      } else if (!clientId) {
        const data = await fetchAllCards();
        setCards(data); setLastUpdated(new Date());
        triggerSync().catch(console.error);
      }
    } catch (err) {
      console.error('Erro ao buscar cards (mantendo cache se houver):', err);
      if (!clientId && !hadCache) {
        try { const data = await fetchAllCards(); setCards(data); setLastUpdated(new Date()); } catch (e) { console.error(e); }
      }
    } finally {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setLoading(false);
    }
  }, [clientId]);

  const refreshCards = useCallback(async () => {
    setLoading(true);
    try {
      if (!clientId) await triggerSync();
      const { cards: dbCards, syncedAt } = await fetchCardsFromDB(clientId);
      if (dbCards.length > 0) { setCards(dbCards); setLastUpdated(syncedAt ? new Date(syncedAt) : new Date()); cacheSet(cardsKey(clientId), { cards: dbCards, syncedAt }); }
    } catch (err) {
      console.error('Erro ao sincronizar:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const silentRefresh = useCallback(async () => {
    try {
      if (!clientId) await triggerSync();
      const { cards: dbCards, syncedAt } = await fetchCardsFromDB(clientId);
      if (dbCards.length > 0) { setCards(dbCards); setLastUpdated(syncedAt ? new Date(syncedAt) : new Date()); cacheSet(cardsKey(clientId), { cards: dbCards, syncedAt }); }
    } catch (err) {
      console.error('Silent refresh error:', err);
    }
  }, [clientId]);

  return { cards, loading, lastUpdated, loadCards, refreshCards, silentRefresh };
}
