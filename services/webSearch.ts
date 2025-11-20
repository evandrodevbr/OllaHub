import { invoke } from '@tauri-apps/api/core';
import { SearchCategory } from '@/store/settings-store';

export interface ScrapedContent {
  title: string;
  url: string;
  content: string;
  markdown: string;
  cached?: boolean;
}

export interface SearchConfig {
  maxConcurrentTabs: number;
  totalSourcesLimit: number;
  categories: SearchCategory[];
  userCustomSites: string[];
  excludedDomains: string[];
}

export interface SearchResultMetadata {
  title: string;
  url: string;
  snippet: string;
}

interface CachedResult {
  results: ScrapedContent[];
  timestamp: number;
  query: string;
}

interface PendingRequest {
  query: string;
  limit: number;
  excludedDomains: string[];
  searchConfig?: SearchConfig;
  resolve: (results: ScrapedContent[]) => void;
  reject: (error: Error) => void;
}

/**
 * Serviço de Web Search com cache e rate limiting
 */
class WebSearchService {
  private cache: Map<string, CachedResult> = new Map();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hora
  private readonly RATE_LIMIT_DELAY = 5000; // 5 segundos
  private lastSearchTime = 0;
  private pendingRequest: PendingRequest | null = null;
  private rateLimitQueue: PendingRequest[] = [];

  constructor() {
    // Carregar cache do localStorage na inicialização
    this.loadCacheFromStorage();
  }

  /**
   * Carrega cache do localStorage
   */
  private loadCacheFromStorage(): void {
    // Verificar se estamos no ambiente do browser (não SSR)
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    
    try {
      const stored = localStorage.getItem('webSearchCache');
      if (stored) {
        const parsed = JSON.parse(stored) as Array<[string, CachedResult]>;
        const now = Date.now();
        
        // Filtrar entradas expiradas
        for (const [key, value] of parsed) {
          if (now - value.timestamp < this.CACHE_TTL) {
            this.cache.set(key, value);
          }
        }
      }
    } catch (error) {
      console.warn('Erro ao carregar cache do Web Search:', error);
    }
  }

  /**
   * Salva cache no localStorage
   */
  private saveCacheToStorage(): void {
    // Verificar se estamos no ambiente do browser (não SSR)
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    
    try {
      const entries = Array.from(this.cache.entries());
      localStorage.setItem('webSearchCache', JSON.stringify(entries));
    } catch (error) {
      console.warn('Erro ao salvar cache do Web Search:', error);
    }
  }

  /**
   * Gera chave de cache baseada na query
   */
  private getCacheKey(query: string, limit?: number): string {
    const normalizedQuery = query.toLowerCase().trim();
    return `search:${normalizedQuery}:${limit || 3}`;
  }

  /**
   * Verifica se há resultado em cache válido
   */
  private getCachedResult(query: string, limit?: number): ScrapedContent[] | null {
    const key = this.getCacheKey(query, limit);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_TTL) {
      // Cache expirado, remover
      this.cache.delete(key);
      this.saveCacheToStorage();
      return null;
    }
    
    return cached.results;
  }

  /**
   * Salva resultado no cache
   */
  private setCachedResult(query: string, results: ScrapedContent[], limit?: number): void {
    const key = this.getCacheKey(query, limit);
    this.cache.set(key, {
      results,
      timestamp: Date.now(),
      query: query.toLowerCase().trim(),
    });
    this.saveCacheToStorage();
  }

  /**
   * Processa fila de rate limiting
   */
  private async processRateLimitQueue(): Promise<void> {
    if (this.rateLimitQueue.length === 0) return;
    
    const now = Date.now();
    const timeSinceLastSearch = now - this.lastSearchTime;
    
    if (timeSinceLastSearch < this.RATE_LIMIT_DELAY) {
      // Aguardar antes de processar próximo
      const waitTime = this.RATE_LIMIT_DELAY - timeSinceLastSearch;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    const nextRequest = this.rateLimitQueue.shift();
    if (nextRequest) {
      this.lastSearchTime = Date.now();
      this.pendingRequest = nextRequest;
      
      try {
        const results = await this.executeSearch(
          nextRequest.query, 
          nextRequest.limit, 
          nextRequest.excludedDomains,
          nextRequest.searchConfig
        );
        nextRequest.resolve(results);
      } catch (error) {
        nextRequest.reject(error instanceof Error ? error : new Error('Erro desconhecido'));
      } finally {
        this.pendingRequest = null;
        // Processar próximo da fila
        this.processRateLimitQueue();
      }
    }
  }

  /**
   * Executa busca no backend (sem cache/rate limit)
   */
  private async executeSearch(
    query: string, 
    limit: number = 3,
    excludedDomains: string[] = [],
    searchConfig?: SearchConfig
  ): Promise<ScrapedContent[]> {
    try {
      // Se SearchConfig foi fornecido, converter para formato Rust
      let rustConfig: any = undefined;
      if (searchConfig) {
        rustConfig = {
          max_concurrent_tabs: searchConfig.maxConcurrentTabs,
          total_sources_limit: searchConfig.totalSourcesLimit,
          categories: searchConfig.categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            base_sites: cat.baseSites,
            enabled: cat.enabled,
          })),
          user_custom_sites: searchConfig.userCustomSites,
          excluded_domains: searchConfig.excludedDomains,
        };
      }

      const results = await invoke<ScrapedContent[]>('search_and_extract_content', {
        query: query.trim(),
        limit: searchConfig ? undefined : limit, // Só usar limit se não tiver config
        excluded_domains: searchConfig ? undefined : (excludedDomains.length > 0 ? excludedDomains : undefined),
        search_config: rustConfig,
      });
      
      return results || [];
    } catch (error) {
      console.error('Erro ao buscar conteúdo:', error);
      throw error instanceof Error ? error : new Error('Falha ao buscar conteúdo na web');
    }
  }

  /**
   * Executa busca de metadados (sem scraping)
   */
  private async executeMetadataSearch(
    query: string,
    limit: number = 5,
    searchConfig?: SearchConfig
  ): Promise<SearchResultMetadata[]> {
    try {
      let rustConfig: any = undefined;
      if (searchConfig) {
        rustConfig = {
          max_concurrent_tabs: searchConfig.maxConcurrentTabs,
          total_sources_limit: searchConfig.totalSourcesLimit,
          categories: searchConfig.categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            base_sites: cat.baseSites,
            enabled: cat.enabled,
          })),
          user_custom_sites: searchConfig.userCustomSites,
          excluded_domains: searchConfig.excludedDomains,
        };
      }

      const results = await invoke<SearchResultMetadata[]>('search_web_metadata', {
        query: query.trim(),
        limit,
        search_config: rustConfig,
      });
      return results || [];
    } catch (error) {
      console.error('Erro ao buscar metadados:', error);
      throw error instanceof Error ? error : new Error('Falha ao buscar metadados');
    }
  }

  /**
   * Busca conteúdo na web com cache e rate limiting
   */
  async search(
    query: string, 
    limit: number = 3, 
    excludedDomains: string[] = [],
    searchConfig?: SearchConfig
  ): Promise<ScrapedContent[]> {
    if (!query || !query.trim()) {
      return [];
    }

    // Verificar cache primeiro
    const cached = this.getCachedResult(query, limit);
    if (cached) {
      return cached.map(r => ({ ...r, cached: true }));
    }

    // Se já há uma requisição pendente para a mesma query, aguardar
    if (this.pendingRequest && this.pendingRequest.query.toLowerCase() === query.toLowerCase()) {
      return new Promise((resolve, reject) => {
        const checkPending = () => {
          if (this.pendingRequest?.query.toLowerCase() === query.toLowerCase()) {
            setTimeout(checkPending, 100);
          } else {
            // Tentar cache novamente após requisição completar
            const cachedAfter = this.getCachedResult(query, limit);
            if (cachedAfter) {
              resolve(cachedAfter.map(r => ({ ...r, cached: true })));
            } else {
              reject(new Error('Requisição pendente cancelada'));
            }
          }
        };
        checkPending();
      });
    }

    // Verificar rate limiting
    const now = Date.now();
    const timeSinceLastSearch = now - this.lastSearchTime;

    if (timeSinceLastSearch < this.RATE_LIMIT_DELAY) {
      // Adicionar à fila (armazenar excludedDomains na requisição)
      return new Promise((resolve, reject) => {
        this.rateLimitQueue.push({
          query,
          limit,
          excludedDomains,
          searchConfig,
          resolve: (results) => {
            this.setCachedResult(query, results, limit);
            resolve(results);
          },
          reject,
        });
        this.processRateLimitQueue();
      });
    }

    // Executar imediatamente
    this.lastSearchTime = now;
    this.pendingRequest = { query, limit, excludedDomains, searchConfig, resolve: () => {}, reject: () => {} };
    
    try {
      const results = await this.executeSearch(query, limit, excludedDomains, searchConfig);
      this.setCachedResult(query, results, limit);
      this.pendingRequest = null;
      return results;
    } catch (error) {
      this.pendingRequest = null;
      throw error;
    } finally {
      // Processar fila se houver
      this.processRateLimitQueue();
    }
  }

  /**
   * Busca em duas etapas: metadados → scraping das melhores URLs
   */
  async smartSearchRag(
    query: string,
    limit: number = 3,
    searchConfig?: SearchConfig
  ): Promise<{ metadata: SearchResultMetadata[]; contents: ScrapedContent[] }> {
    if (!query || !query.trim()) {
      return { metadata: [], contents: [] };
    }

    const metas = await this.executeMetadataSearch(query, Math.max(limit * 2, 5), searchConfig);
    const topUrls = metas.map(m => m.url).slice(0, limit);
    if (topUrls.length === 0) {
      return { metadata: metas, contents: [] };
    }
    try {
      const contents = await invoke<ScrapedContent[]>('scrape_urls', { urls: topUrls });
      return { metadata: metas, contents: contents || [] };
    } catch (error) {
      console.error('Erro ao fazer scraping em lote:', error);
      return { metadata: metas, contents: [] };
    }
  }

  /**
   * Extrai conteúdo de uma URL específica
   */
  async extractUrl(url: string): Promise<ScrapedContent> {
    try {
      const result = await invoke<ScrapedContent>('extract_url_content', { url });
      return result;
    } catch (error) {
      console.error('Erro ao extrair URL:', error);
      throw error instanceof Error ? error : new Error('Falha ao extrair conteúdo da URL');
    }
  }

  /**
   * Limpa o cache
   */
  clearCache(): void {
    this.cache.clear();
    // Verificar se estamos no ambiente do browser (não SSR)
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.removeItem('webSearchCache');
    }
  }

  /**
   * Reseta o rate limiter (útil para testes ou após erros)
   */
  resetRateLimit(): void {
    this.lastSearchTime = 0;
    this.pendingRequest = null;
    this.rateLimitQueue = [];
  }
}

// Singleton
export const webSearchService = new WebSearchService();

