import { invoke } from '@tauri-apps/api/core';
import { SearchCategory, useSettingsStore } from '@/store/settings-store';
import { 
  retryWithBackoff, 
  withTimeout, 
  isRetryableError, 
  type RetryConfig,
  calculateEngineTimeout,
  TIMEOUT_CONFIG
} from '@/lib/retry-utils';
import { EngineCircuitBreaker } from './engine-circuit-breaker';
import { FailureCache } from './failure-cache';

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
  private circuitBreaker: EngineCircuitBreaker = new EngineCircuitBreaker();
  private failureCache: FailureCache = new FailureCache();

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
   * Agora com timeout adaptativo baseado em tentativas, circuit breaker e cache de falhas
   */
  private async executeMetadataSearch(
    query: string,
    limit: number = 5,
    searchConfig?: SearchConfig,
    timeoutMs: number = 10000, // Reduzido de 15s para 10s
    attempt: number = 1 // Tentativa atual para timeout adaptativo
  ): Promise<SearchResultMetadata[]> {
    // Verificar cache de falhas
    const failureEntry = this.failureCache.get(query);
    if (failureEntry) {
      console.warn(`[WebSearch] Query falhou recentemente (há ${Math.round((Date.now() - failureEntry.timestamp) / 1000)}s), retornando resultados parciais ou vazio`);
      
      // Retornar resultados parciais se disponíveis
      if (failureEntry.partialResults && failureEntry.partialResults.length > 0) {
        console.log(`[WebSearch] Retornando ${failureEntry.partialResults.length} resultados parciais do cache de falhas`);
        return failureEntry.partialResults as SearchResultMetadata[];
      }
      
      // Se não há resultados parciais, retornar vazio imediatamente (sem retry)
      return [];
    }
    // Obter configurações de motores do store
    const settings = useSettingsStore.getState();
    const defaultEngines = ['google', 'bing', 'yahoo', 'duckduckgo', 'startpage'];
    let engineOrder = settings.webSearch.engineOrder || defaultEngines;
    
    // Priorizar motores usando circuit breaker
    engineOrder = this.circuitBreaker.prioritizeEngines(engineOrder);
    
    // Filtrar motores não disponíveis (circuit breaker aberto)
    const availableEngines = this.circuitBreaker.getAvailableEngines(engineOrder);
    
    if (availableEngines.length === 0) {
      console.warn(`[WebSearch] Todos os motores estão com circuit breaker aberto, tentando todos mesmo assim`);
      // Se todos estão abertos, tentar mesmo assim (pode ser temporário)
      engineOrder = engineOrder;
    } else {
      engineOrder = availableEngines;
      if (availableEngines.length < engineOrder.length) {
        console.log(`[WebSearch] ${engineOrder.length - availableEngines.length} motor(es) com circuit breaker aberto, usando ${availableEngines.length} disponível(is)`);
      }
    }
    
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

    // Calcular timeout adaptativo baseado na tentativa
    const adaptiveTimeout = calculateEngineTimeout(attempt, timeoutMs);
    
    // Log da tentativa
    console.log(`[WebSearch] Executando busca multi-engine para: "${query}"`);
    console.log(`[WebSearch] Engine order: ${engineOrder.join(' → ')}`);
    console.log(`[WebSearch] Limit: ${limit}, Timeout: ${adaptiveTimeout}ms (tentativa ${attempt})`);

    // Executar com retry e timeout adaptativo
    let retryAttempt = 0;
    const retryResult = await retryWithBackoff<SearchResultMetadata[]>(
      async () => {
        retryAttempt++;
        const startTime = Date.now();
        // Timeout ainda mais reduzido em retries internos
        const retryTimeout = calculateEngineTimeout(retryAttempt, adaptiveTimeout);
        
        try {
          const promise = invoke<SearchResultMetadata[]>('search_web_metadata', {
            query: query.trim(),
            limit,
            search_config: rustConfig,
            engineOrder: engineOrder, // Passar ordem de motores
          });
          
          const result = await withTimeout(
            promise,
            retryTimeout,
            `Timeout ao buscar metadados para "${query}" (tentativa ${retryAttempt})`
          );
          
          const duration = Date.now() - startTime;
          console.log(`[WebSearch] Busca concluída em ${duration}ms: ${result.length} resultados`);
          
          // Registrar sucesso no circuit breaker para cada motor usado
          // (assumindo que o primeiro motor disponível foi usado)
          if (engineOrder.length > 0) {
            const usedEngine = engineOrder[0]; // Simplificado: primeiro motor da ordem
            this.circuitBreaker.recordAttempt(usedEngine, true, duration);
          }
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[WebSearch] Erro após ${duration}ms (tentativa ${retryAttempt}):`, errorMsg);
          
          // Registrar falha no circuit breaker para cada motor tentado
          // (assumindo que tentou todos os motores na ordem)
          for (const engine of engineOrder) {
            this.circuitBreaker.recordAttempt(engine, false, duration);
          }
          
          throw error;
        }
      },
      {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 5000,
      }
    );

    if (retryResult.success && retryResult.result) {
      const results = retryResult.result || [];
      if (results.length === 0) {
        console.warn(`[WebSearch] Nenhum resultado encontrado para: "${query}"`);
        console.warn(`[WebSearch] Tentativas: ${retryResult.attempts}, Motores testados: ${engineOrder.join(', ')}`);
      }
      return results;
    }

    // Se falhou, registrar no cache de falhas
    if (retryResult.lastError) {
      const errorMsg = retryResult.lastError.message;
      const isRetryable = isRetryableError(retryResult.lastError);
      
      // Registrar falha no cache (mesmo que seja recuperável, para evitar retentar imediatamente)
      this.failureCache.recordFailure(
        query,
        errorMsg,
        [], // Sem resultados parciais neste ponto
        retryResult.attempts
      );
      
      if (isRetryable) {
        console.warn(
          `[WebSearch] Falha após ${retryResult.attempts} tentativas (erro recuperável):`,
          errorMsg
        );
        console.warn(`[WebSearch] Query: "${query}", Limit: ${limit}, Timeout: ${adaptiveTimeout}ms`);
        console.warn(`[WebSearch] Motores tentados: ${engineOrder.join(', ')}`);
        console.warn(`[WebSearch] Retornando resultados parciais (se houver) ou array vazio`);
        // Retornar vazio mas não quebrar o fluxo - o caller pode continuar com outros motores
        return [];
      } else {
        // Para erros não recuperáveis, logar detalhadamente mas retornar vazio
        console.error(
          `[WebSearch] Erro não recuperável:`,
          errorMsg
        );
        console.error(`[WebSearch] Query: "${query}", Limit: ${limit}, Timeout: ${adaptiveTimeout}ms`);
        console.error(`[WebSearch] Motores tentados: ${engineOrder.join(', ')}`);
        return [];
      }
    }

    return [];
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
   * Agora com timeout adaptativo
   */
  async smartSearchRag(
    query: string,
    limit: number = 3,
    searchConfig?: SearchConfig,
    timeoutMs: number = TIMEOUT_CONFIG.initialTimeout,
    round: number = 1 // Round atual para timeout escalonado
  ): Promise<{ metadata: SearchResultMetadata[]; contents: ScrapedContent[] }> {
    if (!query || !query.trim()) {
      return { metadata: [], contents: [] };
    }

    // Calcular timeout escalonado por round
    const { calculateAdaptiveTimeout } = await import('@/lib/retry-utils');
    const roundTimeout = calculateAdaptiveTimeout(round, timeoutMs);
    
    // Buscar metadados com retry e timeout adaptativo
    const metas = await this.executeMetadataSearch(
      query, 
      Math.max(limit * 2, 5), 
      searchConfig,
      roundTimeout,
      1 // Primeira tentativa
    );
    
    // Continuar mesmo se metadados estiverem vazios (pode ter falhado parcialmente)
    const topUrls = metas.map(m => m.url).slice(0, limit);
    
    if (topUrls.length === 0) {
      // Retornar resultados parciais (metadados vazios mas sem erro)
      return { metadata: metas, contents: [] };
    }
    
    // Tentar fazer scraping mesmo se metadados foram parciais
    // Usar timeout reduzido para scraping (50% do timeout de busca)
    const scrapingTimeout = Math.max(roundTimeout * 0.5, 5000);
    
    try {
      const contents = await withTimeout(
        invoke<ScrapedContent[]>('scrape_urls', { urls: topUrls }),
        scrapingTimeout,
        `Timeout ao fazer scraping para "${query}"`
      );
      return { metadata: metas, contents: contents || [] };
    } catch (error) {
      // Logar erro mas retornar metadados disponíveis (resultado parcial)
      // Graceful degradation: continuar com metadados mesmo se scraping falhar
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[WebSearch] Erro ao fazer scraping (continuando com metadados): ${errorMessage}`);
      console.warn(`[WebSearch] Retornando ${metas.length} metadados sem conteúdo scraped (resultado parcial)`);
      
      // Retornar metadados mesmo se scraping falhou - resultado parcial é melhor que nada
      return { metadata: metas, contents: [] };
    }
  }
  
  /**
   * Versão simplificada que aceita resultados parciais mais rapidamente
   * Retorna assim que qualquer motor retornar resultados, sem esperar todos
   */
  async smartSearchRagPartial(
    query: string,
    limit: number = 3,
    searchConfig?: SearchConfig,
    timeoutMs: number = TIMEOUT_CONFIG.initialTimeout,
    round: number = 1
  ): Promise<{ metadata: SearchResultMetadata[]; contents: ScrapedContent[] }> {
    if (!query || !query.trim()) {
      return { metadata: [], contents: [] };
    }

    // Timeout ainda mais agressivo para resultados parciais
    const partialTimeout = Math.max(timeoutMs * 0.7, 5000); // 70% do timeout normal
    
    try {
      // Buscar metadados com timeout reduzido
      const metas = await this.executeMetadataSearch(
        query, 
        Math.max(limit * 2, 5), 
        searchConfig,
        partialTimeout,
        1
      );
      
      // Se temos metadados, tentar scraping rápido (timeout ainda menor)
      if (metas.length > 0) {
        const topUrls = metas.map(m => m.url).slice(0, limit);
        const scrapingTimeout = Math.max(partialTimeout * 0.4, 3000); // 40% do timeout parcial
        
        try {
          const contents = await withTimeout(
            invoke<ScrapedContent[]>('scrape_urls', { urls: topUrls }),
            scrapingTimeout,
            `Timeout parcial ao fazer scraping para "${query}"`
          );
          return { metadata: metas, contents: contents || [] };
        } catch (error) {
          // Aceitar resultado parcial: metadados sem scraping
          console.warn(`[WebSearch] Scraping parcial falhou, retornando apenas metadados`);
          return { metadata: metas, contents: [] };
        }
      }
      
      return { metadata: metas, contents: [] };
    } catch (error) {
      // Em caso de erro total, retornar vazio mas não quebrar
      console.warn(`[WebSearch] Busca parcial falhou completamente:`, error);
      return { metadata: [], contents: [] };
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

