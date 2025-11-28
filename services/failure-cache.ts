/**
 * Cache de falhas para evitar retentar queries que falharam recentemente
 */

export interface FailureCacheEntry {
  query: string;
  timestamp: number;
  error: string;
  partialResults?: any[]; // Resultados parciais se houver
  attempts: number; // Número de tentativas antes de falhar
}

export interface FailureCacheConfig {
  ttl: number; // Time to live em ms (padrão: 5 minutos)
  maxEntries: number; // Máximo de entradas no cache (padrão: 100)
}

const DEFAULT_CONFIG: FailureCacheConfig = {
  ttl: 5 * 60 * 1000, // 5 minutos
  maxEntries: 100,
};

export class FailureCache {
  private cache: Map<string, FailureCacheEntry> = new Map();
  private config: FailureCacheConfig;

  constructor(config: Partial<FailureCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Limpar entradas expiradas periodicamente
    setInterval(() => this.cleanExpired(), 60000); // A cada 1 minuto
  }

  /**
   * Normaliza uma query para usar como chave
   */
  private normalizeQuery(query: string): string {
    return query.trim().toLowerCase();
  }

  /**
   * Verifica se uma query falhou recentemente
   */
  hasFailed(query: string): boolean {
    const normalized = this.normalizeQuery(query);
    const entry = this.cache.get(normalized);
    
    if (!entry) {
      return false;
    }
    
    // Verificar se expirou
    const age = Date.now() - entry.timestamp;
    if (age >= this.config.ttl) {
      this.cache.delete(normalized);
      return false;
    }
    
    return true;
  }

  /**
   * Obtém entrada de falha (se existir e não expirada)
   */
  get(query: string): FailureCacheEntry | null {
    const normalized = this.normalizeQuery(query);
    const entry = this.cache.get(normalized);
    
    if (!entry) {
      return null;
    }
    
    // Verificar se expirou
    const age = Date.now() - entry.timestamp;
    if (age >= this.config.ttl) {
      this.cache.delete(normalized);
      return null;
    }
    
    return entry;
  }

  /**
   * Registra uma falha
   */
  recordFailure(
    query: string,
    error: string,
    partialResults?: any[],
    attempts: number = 1
  ): void {
    const normalized = this.normalizeQuery(query);
    
    // Limitar tamanho do cache
    if (this.cache.size >= this.config.maxEntries) {
      // Remover entrada mais antiga
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) {
        this.cache.delete(oldest[0]);
      }
    }
    
    this.cache.set(normalized, {
      query: normalized,
      timestamp: Date.now(),
      error,
      partialResults,
      attempts,
    });
    
    console.log(`[FailureCache] Registrada falha para query: "${query.substring(0, 50)}..." (TTL: ${this.config.ttl}ms)`);
  }

  /**
   * Remove uma entrada do cache
   */
  remove(query: string): void {
    const normalized = this.normalizeQuery(query);
    this.cache.delete(normalized);
  }

  /**
   * Limpa todas as entradas expiradas
   */
  cleanExpired(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age >= this.config.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[FailureCache] Limpas ${cleaned} entradas expiradas`);
    }
  }

  /**
   * Limpa todo o cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Obtém estatísticas do cache
   */
  getStats(): { size: number; maxEntries: number; ttl: number } {
    return {
      size: this.cache.size,
      maxEntries: this.config.maxEntries,
      ttl: this.config.ttl,
    };
  }
}

