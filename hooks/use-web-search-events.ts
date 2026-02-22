import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';

export interface ActiveQuery {
  query: string;
  source: string;
  round?: number;
  startedAt: number;
}

export interface ActiveUrl {
  url: string;
  title?: string;
  status: 'started' | 'completed' | 'failed' | 'cached';
  source?: string;
  startedAt: number;
  duration?: number;
}

interface SearchQueryEvent {
  query: string;
  source: string;
  round?: number;
  timestamp: number;
}

interface SearchQueryCompletedEvent {
  query: string;
  source: string;
  results_count: number;
  success: boolean;
  timestamp: number;
}

interface SearchSourceSwitchEvent {
  from: string;
  to: string;
  reason: string;
  timestamp: number;
}

interface ScrapingUrlEvent {
  url: string;
  title?: string;
  status: string;
  duration_ms?: number;
  source?: string;
  timestamp: number;
}

export function useWebSearchEvents() {
  const [activeQueries, setActiveQueries] = useState<ActiveQuery[]>([]);
  const [activeUrls, setActiveUrls] = useState<ActiveUrl[]>([]);

  useEffect(() => {
    let unlistenQueries: (() => void) | null = null;
    let unlistenCompleted: (() => void) | null = null;
    let unlistenSwitched: (() => void) | null = null;
    let unlistenScraping: (() => void) | null = null;

    const setupListeners = async () => {
      // Listener para query iniciada
      unlistenQueries = await listen<SearchQueryEvent>('search-query-started', (event) => {
        const { query, source, round, timestamp } = event.payload;
        setActiveQueries((prev) => {
          // Remover query anterior se existir (mesma query)
          const filtered = prev.filter((q) => q.query !== query);
          return [
            ...filtered,
            {
              query,
              source,
              round,
              startedAt: timestamp,
            },
          ];
        });
      });

      // Listener para query completada
      unlistenCompleted = await listen<SearchQueryCompletedEvent>('search-query-completed', (event) => {
        const { query, source } = event.payload;
        setActiveQueries((prev) => prev.filter((q) => !(q.query === query && q.source === source)));
      });

      // Listener para mudança de fonte
      unlistenSwitched = await listen<SearchSourceSwitchEvent>('search-source-switched', (event) => {
        const { from, to, reason } = event.payload;
        console.log(`[WebSearchEvents] Source switched: ${from} → ${to} (${reason})`);
        // Atualizar query ativa para nova fonte
        setActiveQueries((prev) =>
          prev.map((q) => (q.source === from ? { ...q, source: to } : q))
        );
      });

      // Listener para eventos de scraping
      unlistenScraping = await listen<ScrapingUrlEvent>('scraping-url-event', (event) => {
        const { url, title, status, duration_ms, source, timestamp } = event.payload;
        
        setActiveUrls((prev) => {
          const existingIndex = prev.findIndex((u) => u.url === url);
          const newUrl: ActiveUrl = {
            url,
            title,
            status: status as ActiveUrl['status'],
            source,
            startedAt: timestamp,
            duration: duration_ms,
          };

          if (existingIndex >= 0) {
            // Atualizar URL existente
            const updated = [...prev];
            updated[existingIndex] = newUrl;
            return updated;
          } else {
            // Adicionar nova URL
            return [...prev, newUrl];
          }
        });

        // Remover URLs completadas/falhadas após 5 segundos
        if (status === 'completed' || status === 'failed' || status === 'cached') {
          setTimeout(() => {
            setActiveUrls((prev) => prev.filter((u) => u.url !== url));
          }, 5000);
        }
      });
    };

    setupListeners();

    return () => {
      if (unlistenQueries) unlistenQueries();
      if (unlistenCompleted) unlistenCompleted();
      if (unlistenSwitched) unlistenSwitched();
      if (unlistenScraping) unlistenScraping();
    };
  }, []);

  const clearActiveQueries = useCallback(() => {
    setActiveQueries([]);
  }, []);

  const clearActiveUrls = useCallback(() => {
    setActiveUrls([]);
  }, []);

  const clearAll = useCallback(() => {
    setActiveQueries([]);
    setActiveUrls([]);
  }, []);

  return {
    activeQueries,
    activeUrls,
    clearActiveQueries,
    clearActiveUrls,
    clearAll,
  };
}
