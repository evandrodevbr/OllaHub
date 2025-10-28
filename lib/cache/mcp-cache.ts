import { DeepNLPSearchParams } from "@/lib/types/mcp";

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

export class MCPCache {
  private static cache = new Map<string, CacheEntry>();
  private static TTL = 5 * 60 * 1000; // 5 minutos em millisegundos

  /**
   * Obter dados do cache
   */
  static get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Verificar se expirou
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    console.log(`Cache hit for key: ${key}`);
    return entry.data;
  }

  /**
   * Salvar dados no cache
   */
  static set(key: string, value: any, ttl?: number): void {
    const entry: CacheEntry = {
      data: value,
      timestamp: Date.now(),
      ttl: ttl || this.TTL
    };

    this.cache.set(key, entry);
    console.log(`Cache set for key: ${key}, TTL: ${entry.ttl}ms`);
  }

  /**
   * Limpar cache
   */
  static clear(): void {
    this.cache.clear();
    console.log("Cache cleared");
  }

  /**
   * Remover entrada específica do cache
   */
  static delete(key: string): void {
    this.cache.delete(key);
    console.log(`Cache entry deleted for key: ${key}`);
  }

  /**
   * Gerar chave de cache baseada nos parâmetros de busca
   */
  static generateKey(params: DeepNLPSearchParams): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result, key) => {
        const value = params[key as keyof DeepNLPSearchParams];
        if (value !== undefined && value !== null) {
          result[key] = value;
        }
        return result;
      }, {} as Record<string, any>);

    return `mcp_search_${JSON.stringify(sortedParams)}`;
  }

  /**
   * Gerar chave para configuração de servidor
   */
  static generateServerConfigKey(mcpId: string): string {
    return `mcp_config_${mcpId}`;
  }

  /**
   * Gerar chave para ferramentas de servidor
   */
  static generateServerToolsKey(mcpId: string): string {
    return `mcp_tools_${mcpId}`;
  }

  /**
   * Obter estatísticas do cache
   */
  static getStats(): {
    size: number;
    entries: Array<{ key: string; age: number; ttl: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
      ttl: entry.ttl
    }));

    return {
      size: this.cache.size,
      entries
    };
  }

  /**
   * Limpar entradas expiradas
   */
  static cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cache cleanup: removed ${cleaned} expired entries`);
    }

    return cleaned;
  }

  /**
   * Verificar se uma chave existe no cache (sem verificar TTL)
   */
  static has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Obter todas as chaves do cache
   */
  static keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Definir TTL personalizado para diferentes tipos de dados
   */
  static getTTLForDataType(dataType: 'search' | 'config' | 'tools'): number {
    switch (dataType) {
      case 'search':
        return 5 * 60 * 1000; // 5 minutos para buscas
      case 'config':
        return 30 * 60 * 1000; // 30 minutos para configurações
      case 'tools':
        return 15 * 60 * 1000; // 15 minutos para ferramentas
      default:
        return this.TTL;
    }
  }

  /**
   * Cache com TTL específico para tipo de dados
   */
  static setWithDataType(key: string, value: any, dataType: 'search' | 'config' | 'tools'): void {
    const ttl = this.getTTLForDataType(dataType);
    this.set(key, value, ttl);
  }
}
