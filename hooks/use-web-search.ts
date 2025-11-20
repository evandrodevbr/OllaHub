import { useState, useCallback } from 'react';
import { webSearchService, ScrapedContent, SearchConfig } from '@/services/webSearch';
import { useSettingsStore } from '@/store/settings-store';

export type SearchStatus = 'idle' | 'searching' | 'scraping' | 'completed' | 'error';

export interface WebSearchState {
  isEnabled: boolean;
  status: SearchStatus;
  currentQuery: string;
  scrapedSources: ScrapedContent[];
  error: string | null;
}

const DEFAULT_STATE: WebSearchState = {
  isEnabled: true,
  status: 'idle',
  currentQuery: '',
  scrapedSources: [],
  error: null,
};

/**
 * Hook para gerenciar estado do Web Search
 */
export function useWebSearch() {
  const [state, setState] = useState<WebSearchState>(() => {
    // Carregar preferência do localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('webSearchEnabled');
      return {
        ...DEFAULT_STATE,
        isEnabled: saved !== null ? saved === 'true' : true,
      };
    }
    return DEFAULT_STATE;
  });

  /**
   * Ativa/desativa Web Search
   */
  const setEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, isEnabled: enabled }));
    if (typeof window !== 'undefined') {
      localStorage.setItem('webSearchEnabled', String(enabled));
    }
  }, []);

  /**
   * Executa busca
   */
  const search = useCallback(async (query: string, limit: number = 3, excludedDomains: string[] = []): Promise<ScrapedContent[]> => {
    if (!query || !query.trim()) {
      return [];
    }

    setState(prev => ({
      ...prev,
      status: 'searching',
      currentQuery: query,
      error: null,
      scrapedSources: [],
    }));

    try {
      // Buscar configurações do store
      const settings = useSettingsStore.getState();
      
      // Construir SearchConfig a partir das configurações
      const searchConfig: SearchConfig = {
        maxConcurrentTabs: settings.webSearch.maxConcurrentTabs,
        totalSourcesLimit: settings.webSearch.totalSourcesLimit,
        categories: settings.webSearch.categories,
        userCustomSites: settings.webSearch.userCustomSites,
        excludedDomains: excludedDomains.length > 0 ? excludedDomains : settings.webSearch.excludedDomains,
      };

      // Fase 1: Buscando
      setState(prev => ({ ...prev, status: 'searching' }));

      // Fase 2: Scraping (o serviço já faz isso internamente)
      setState(prev => ({ ...prev, status: 'scraping' }));

      const results = await webSearchService.search(query, limit, excludedDomains, searchConfig);

      // [DEBUG INJECTION START]
      console.log('🌐 Debug: Web Search Service Results', {
        count: results.length,
        firstResultHasMarkdown: results[0] ? !!results[0].markdown : 'N/A',
        firstResultMarkdownLen: results[0]?.markdown?.length || 0,
        allResults: results.map((r, idx) => ({
          index: idx,
          url: r.url,
          title: r.title,
          hasMarkdown: !!r.markdown,
          markdownLength: r.markdown?.length || 0,
          markdownPreview: r.markdown?.substring(0, 150) || 'SEM MARKDOWN'
        }))
      });
      // [DEBUG INJECTION END]

      setState(prev => ({
        ...prev,
        status: 'completed',
        scrapedSources: results,
        error: null,
      }));

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao buscar';
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
        scrapedSources: [],
      }));
      throw error;
    }
  }, []);

  /**
   * Extrai conteúdo de uma URL
   */
  const extractUrl = useCallback(async (url: string): Promise<ScrapedContent> => {
    setState(prev => ({
      ...prev,
      status: 'scraping',
      error: null,
    }));

    try {
      const result = await webSearchService.extractUrl(url);
      setState(prev => ({
        ...prev,
        status: 'completed',
        error: null,
      }));
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao extrair URL';
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }));
      throw error;
    }
  }, []);

  /**
   * Reseta o estado
   */
  const reset = useCallback(() => {
    setState({
      ...DEFAULT_STATE,
      isEnabled: state.isEnabled, // Manter preferência
    });
  }, [state.isEnabled]);

  /**
   * Limpa cache
   */
  const clearCache = useCallback(() => {
    webSearchService.clearCache();
  }, []);

  return {
    ...state,
    setEnabled,
    search,
    extractUrl,
    reset,
    clearCache,
  };
}

