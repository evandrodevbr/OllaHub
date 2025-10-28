import { getDatabase } from "@/database/database";
import { PulseMCPService } from "@/lib/services/pulsemcp";

const db = getDatabase();

export interface MCPSearchParams {
  query?: string;
  category?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  order?: "asc" | "desc";
}

export interface MCPCacheItem {
  id: string;
  owner: string;
  repo: string;
  content_name: string;
  publisher_id: string;
  description?: string;
  category?: string;
  subfield?: string;
  field?: string;
  rating: number;
  review_cnt: number;
  content_tag_list?: string;
  thumbnail_picture?: string;
  website?: string;
  detail_url?: string;
  ext_info?: any;
  created_at: number;
  updated_at: number;
}

export class MCPCacheRepository {
  private static readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas em millisegundos

  /**
   * Verificar se cache está válido (< 24h)
   */
  static isCacheValid(): boolean {
    try {
      const lastSync = this.getLastSync();
      if (!lastSync) return false;

      const now = Date.now();
      return now - lastSync < this.CACHE_TTL;
    } catch (error) {
      console.error("Error checking cache validity:", error);
      return false;
    }
  }

  /**
   * Obter timestamp da última sincronização
   */
  static getLastSync(): number | null {
    try {
      const stmt = db.prepare(
        "SELECT value FROM mcp_cache_metadata WHERE key = 'last_sync'"
      );
      const result = stmt.get() as { value: string } | undefined;
      return result ? parseInt(result.value) : null;
    } catch (error) {
      console.error("Error getting last sync:", error);
      return null;
    }
  }

  /**
   * Salvar múltiplos MCPs em batch (performance)
   */
  static saveBatch(mcps: any[]): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO mcp_marketplace_cache (
          id, owner, repo, content_name, publisher_id, description,
          category, subfield, field, rating, review_cnt, content_tag_list,
          thumbnail_picture, website, detail_url, ext_info, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          owner = EXCLUDED.owner,
          repo = EXCLUDED.repo,
          content_name = EXCLUDED.content_name,
          publisher_id = EXCLUDED.publisher_id,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          subfield = EXCLUDED.subfield,
          field = EXCLUDED.field,
          rating = EXCLUDED.rating,
          review_cnt = EXCLUDED.review_cnt,
          content_tag_list = EXCLUDED.content_tag_list,
          thumbnail_picture = EXCLUDED.thumbnail_picture,
          website = EXCLUDED.website,
          detail_url = EXCLUDED.detail_url,
          ext_info = EXCLUDED.ext_info,
          updated_at = EXCLUDED.updated_at
      `);

      const now = Date.now();

      for (const pulseMCPItem of mcps) {
        // Transformar dados PulseMCP para formato interno
        const mcpProvider =
          PulseMCPService.transformToMCPProvider(pulseMCPItem);

        // Extrair owner/repo do package_name ou usar name como fallback
        const packageName = pulseMCPItem.package_name || pulseMCPItem.name;
        const [owner, repo] = packageName.includes("/")
          ? packageName.split("/")
          : ["", packageName];

        stmt.run(
          mcpProvider.id,
          owner,
          repo,
          mcpProvider.name,
          mcpProvider.author,
          mcpProvider.description,
          mcpProvider.category,
          mcpProvider.subfield,
          mcpProvider.field,
          mcpProvider.rating,
          mcpProvider.totalRatings,
          mcpProvider.tags.join(","),
          null, // Não temos ícones disponíveis
          mcpProvider.homepage || null,
          pulseMCPItem.source_code_url || null,
          JSON.stringify({
            package_registry: pulseMCPItem.package_registry,
            package_name: pulseMCPItem.package_name,
            github_stars: pulseMCPItem.github_stars,
            package_download_count: pulseMCPItem.package_download_count,
            config: mcpProvider.config,
            tools: mcpProvider.tools,
            pulseMCP_meta: pulseMCPItem._meta,
          }),
          now,
          now
        );
      }

      console.log(`Saved batch of ${mcps.length} MCPs to cache`);
    } catch (error) {
      console.error("Error saving MCP batch:", error);
      throw error;
    }
  }

  /**
   * Limpar cache antigo
   */
  static clearCache(): void {
    try {
      db.exec("DELETE FROM mcp_marketplace_cache");
      db.exec("DELETE FROM mcp_cache_metadata");
      console.log("MCP cache cleared");
    } catch (error) {
      console.error("Error clearing cache:", error);
      throw error;
    }
  }

  /**
   * Buscar MCPs no cache com filtros
   */
  static search(params: MCPSearchParams): MCPCacheItem[] {
    try {
      let query = "SELECT * FROM mcp_marketplace_cache WHERE 1=1";
      const queryParams: any[] = [];

      // Filtro por categoria
      if (params.category) {
        query += " AND (category = ? OR subfield = ?)";
        queryParams.push(params.category, params.category);
      }

      // Filtro por busca textual
      if (params.query) {
        query +=
          " AND (content_name LIKE ? OR description LIKE ? OR content_tag_list LIKE ?)";
        const searchTerm = `%${params.query}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
      }

      // Ordenação dinâmica
      const order = params.order || "desc"; // Padrão descrescente
      let orderClause = "";

      switch (params.sortBy) {
        case "rating":
          orderClause = `ORDER BY rating ${order.toUpperCase()}`;
          break;
        case "downloads":
          orderClause = `ORDER BY review_cnt ${order.toUpperCase()}`;
          break;
        case "name":
          orderClause = `ORDER BY content_name ${order.toUpperCase()}`;
          break;
        case "recent":
          orderClause = `ORDER BY updated_at ${order.toUpperCase()}`;
          break;
        case "total_ratings":
          orderClause = `ORDER BY review_cnt ${order.toUpperCase()}`;
          break;
        case "updated_at":
          orderClause = `ORDER BY updated_at ${order.toUpperCase()}`;
          break;
        default:
          orderClause = `ORDER BY rating DESC`; // Padrão
      }

      query += ` ${orderClause}`;

      // Paginação
      if (params.limit) {
        query += " LIMIT ?";
        queryParams.push(params.limit);

        if (params.offset) {
          query += " OFFSET ?";
          queryParams.push(params.offset);
        }
      }

      const stmt = db.prepare(query);
      const results = stmt.all(...queryParams) as MCPCacheItem[];

      console.log(`Found ${results.length} MCPs in cache for search:`, params);
      return results;
    } catch (error) {
      console.error("Error searching MCP cache:", error);
      return [];
    }
  }

  /**
   * Contar total de MCPs no cache
   */
  static count(filters?: { category?: string }): number {
    try {
      let query =
        "SELECT COUNT(*) as count FROM mcp_marketplace_cache WHERE 1=1";
      const queryParams: any[] = [];

      if (filters?.category) {
        query += " AND (category = ? OR subfield = ?)";
        queryParams.push(filters.category, filters.category);
      }

      const stmt = db.prepare(query);
      const result = stmt.get(...queryParams) as { count: number };
      return result.count;
    } catch (error) {
      console.error("Error counting MCP cache:", error);
      return 0;
    }
  }

  /**
   * Atualizar metadados do cache
   */
  static updateMetadata(key: string, value: string): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO mcp_cache_metadata (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at
      `);
      stmt.run(key, value, Date.now());
    } catch (error) {
      console.error("Error updating cache metadata:", error);
      throw error;
    }
  }

  /**
   * Verificar se precisa sincronizar
   */
  static needsSync(): boolean {
    try {
      // Se não há dados no cache, precisa sincronizar
      const count = this.count();
      if (count === 0) return true;

      // Se cache expirou, precisa sincronizar
      return !this.isCacheValid();
    } catch (error) {
      console.error("Error checking if sync is needed:", error);
      return true;
    }
  }

  /**
   * Obter estatísticas do cache
   */
  static getStats(): {
    totalItems: number;
    lastSync: number | null;
    isValid: boolean;
    categories: Record<string, number>;
  } {
    try {
      const totalItems = this.count();
      const lastSync = this.getLastSync();
      const isValid = this.isCacheValid();

      // Contar por categoria
      const categoryStmt = db.prepare(`
        SELECT category, COUNT(*) as count 
        FROM mcp_marketplace_cache 
        WHERE category IS NOT NULL 
        GROUP BY category
      `);
      const categoryResults = categoryStmt.all() as Array<{
        category: string;
        count: number;
      }>;

      const categories = categoryResults.reduce((acc, row) => {
        acc[row.category] = row.count;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalItems,
        lastSync,
        isValid,
        categories,
      };
    } catch (error) {
      console.error("Error getting cache stats:", error);
      return {
        totalItems: 0,
        lastSync: null,
        isValid: false,
        categories: {},
      };
    }
  }

  /**
   * Verificar se uma tabela existe
   */
  static tableExists(tableName: string): boolean {
    try {
      const stmt = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name=?
      `);
      const result = stmt.get(tableName);
      return !!result;
    } catch (error) {
      console.error("Error checking if table exists:", error);
      return false;
    }
  }

  /**
   * Extrair categorias dinamicamente do cache
   * Retorna categorias principais e outras categorias menos comuns
   */
  static getCategories(): {
    primary: Array<{ category: string; count: number }>;
    others: Array<{ category: string; count: number }>;
  } {
    try {
      // Categorias principais definidas (baseadas nos dados reais da API)
      const primaryCategories = [
        "MAP",
        "BROWSER",
        "OFFICE",
        "CODE",
        "DATABASE",
        "SEARCH",
        "PAYMENT",
        "CHART",
        "FINANCE",
        "OTHER",
      ];

      // Query para obter todas as categorias com contadores
      const stmt = db.prepare(`
        SELECT 
          COALESCE(subfield, category, 'other') as category,
          COUNT(*) as count
        FROM mcp_marketplace_cache 
        WHERE COALESCE(subfield, category, 'other') IS NOT NULL
        GROUP BY COALESCE(subfield, category, 'other')
        ORDER BY count DESC
      `);

      const allCategories = stmt.all() as Array<{
        category: string;
        count: number;
      }>;

      // Separar em categorias principais e outras
      const primary: Array<{ category: string; count: number }> = [];
      const others: Array<{ category: string; count: number }> = [];

      for (const cat of allCategories) {
        const normalizedCategory = cat.category.toUpperCase();

        if (primaryCategories.includes(normalizedCategory)) {
          primary.push({
            category: normalizedCategory,
            count: cat.count,
          });
        } else {
          others.push({
            category: cat.category,
            count: cat.count,
          });
        }
      }

      // Ordenar categorias principais por contagem (desc)
      primary.sort((a, b) => b.count - a.count);

      // Ordenar outras categorias por contagem (desc)
      others.sort((a, b) => b.count - a.count);

      console.log(
        `📊 Extracted categories: ${primary.length} primary, ${others.length} others`
      );

      return { primary, others };
    } catch (error) {
      console.error("Error extracting categories:", error);
      return { primary: [], others: [] };
    }
  }

  /**
   * Obter estatísticas detalhadas de categorias
   */
  static getCategoryStats(): {
    totalCategories: number;
    primaryCategories: number;
    otherCategories: number;
    totalMCPs: number;
    categoryBreakdown: Record<string, number>;
  } {
    try {
      const categories = this.getCategories();
      const totalMCPs = this.count();

      const categoryBreakdown: Record<string, number> = {};

      // Adicionar categorias principais
      for (const cat of categories.primary) {
        categoryBreakdown[cat.category] = cat.count;
      }

      // Adicionar outras categorias
      for (const cat of categories.others) {
        categoryBreakdown[cat.category] = cat.count;
      }

      return {
        totalCategories: categories.primary.length + categories.others.length,
        primaryCategories: categories.primary.length,
        otherCategories: categories.others.length,
        totalMCPs,
        categoryBreakdown,
      };
    } catch (error) {
      console.error("Error getting category stats:", error);
      return {
        totalCategories: 0,
        primaryCategories: 0,
        otherCategories: 0,
        totalMCPs: 0,
        categoryBreakdown: {},
      };
    }
  }
}
