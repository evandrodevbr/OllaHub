import { DeepNLPService } from "./deepnlp";
import { MCPCacheRepository } from "@/database/repositories/mcp-cache";

export interface SyncProgress {
  current: number;
  total: number;
  page: number;
  totalPages: number;
}

export interface SyncResult {
  success: boolean;
  totalDownloaded: number;
  errors: string[];
  duration: number;
}

export class MCPSyncService {
  private static isSyncingFlag = false;
  private static abortController: AbortController | null = null;
  private static currentProgress: SyncProgress | null = null;

  /**
   * Download completo com paginação incremental
   */
  static async syncAll(
    onProgress?: (progress: SyncProgress) => void
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let totalDownloaded = 0;

    try {
      if (this.isSyncingFlag) {
        throw new Error("Sync already in progress");
      }

      this.isSyncingFlag = true;
      this.abortController = new AbortController();

      console.log("🔄 Starting MCP marketplace sync...");

      // Limpar cache antigo antes de começar
      MCPCacheRepository.clearCache();

      const allMCPs = await this.downloadAllPages(onProgress);
      totalDownloaded = allMCPs.length;

      // Salvar todos os MCPs no banco
      if (allMCPs.length > 0) {
        MCPCacheRepository.saveBatch(allMCPs);

        // Atualizar metadados
        MCPCacheRepository.updateMetadata("last_sync", Date.now().toString());
        MCPCacheRepository.updateMetadata(
          "total_items",
          allMCPs.length.toString()
        );

        console.log(`✅ Sync completed: ${totalDownloaded} MCPs downloaded`);
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        totalDownloaded,
        errors,
        duration,
      };
    } catch (error: any) {
      console.error("❌ Sync failed:", error);
      errors.push(error.message);

      const duration = Date.now() - startTime;
      return {
        success: false,
        totalDownloaded,
        errors,
        duration,
      };
    } finally {
      this.isSyncingFlag = false;
      this.abortController = null;
      this.currentProgress = null;
    }
  }

  /**
   * Sincronização em background (usado automaticamente)
   */
  static async backgroundSync(): Promise<void> {
    try {
      if (this.isSyncingFlag) {
        console.log("Sync already in progress, skipping background sync");
        return;
      }

      console.log("🔄 Starting background MCP sync...");
      await this.syncAll((progress) => {
        console.log(
          `📥 Downloaded ${progress.current}/${progress.total} MCPs (page ${progress.page}/${progress.totalPages})`
        );
      });
    } catch (error) {
      console.error("Background sync failed:", error);
    }
  }

  /**
   * Verificar se sincronização está em andamento
   */
  static isSyncing(): boolean {
    return this.isSyncingFlag;
  }

  /**
   * Cancelar sincronização atual
   */
  static cancelSync(): void {
    if (this.abortController) {
      this.abortController.abort();
      console.log("🛑 Sync cancelled by user");
    }
  }

  /**
   * Obter progresso atual da sincronização
   */
  static getCurrentProgress(): SyncProgress | null {
    return this.currentProgress;
  }

  /**
   * Download paginado de todas as páginas - SEM LIMITE ARTIFICIAL
   */
  private static async downloadAllPages(
    onProgress?: (progress: SyncProgress) => void
  ): Promise<any[]> {
    const allMCPs: any[] = [];
    let page = 0;
    let COUNT_PER_PAGE = 100; // Começar com 100
    let totalHits = 0;
    let consecutiveEmptyPages = 0; // Contador para páginas vazias consecutivas

    console.log("📡 Starting unlimited paginated download...");

    while (!this.abortController?.signal.aborted) {
      try {
        const params = {
          mode: "list" as const,
          page_id: page,
          count_per_page: COUNT_PER_PAGE,
        };

        console.log(
          `📄 Downloading page ${
            page + 1
          } (${COUNT_PER_PAGE} items per page)...`
        );

        const response = await DeepNLPService.searchMCPs(params);

        // Se não há itens na resposta, incrementar contador de páginas vazias
        if (!response.items || response.items.length === 0) {
          consecutiveEmptyPages++;
          console.log(
            `⚠️ Empty page ${
              page + 1
            } (${consecutiveEmptyPages} consecutive empty pages)`
          );

          // Se temos 3 páginas vazias consecutivas, parar o download
          if (consecutiveEmptyPages >= 3) {
            console.log(
              "🛑 Stopping download: 3 consecutive empty pages detected"
            );
            break;
          }

          page++;
          continue;
        }

        // Reset contador de páginas vazias se encontramos dados
        consecutiveEmptyPages = 0;
        allMCPs.push(...response.items);

        // Atualizar total hits na primeira página
        if (page === 0) {
          totalHits = response.total_hits;
          console.log(`📊 Total MCPs available: ${totalHits}`);
        }

        // Notificar progresso
        this.currentProgress = {
          current: allMCPs.length,
          total: totalHits,
          page: page + 1,
          totalPages:
            totalHits > 0 ? Math.ceil(totalHits / COUNT_PER_PAGE) : page + 1,
        };

        if (onProgress) {
          onProgress(this.currentProgress);
        }

        // Incrementar página
        page++;

        // Salvar em batch a cada 500 itens para evitar bloqueio
        if (allMCPs.length % 500 === 0) {
          console.log(`💾 Saving batch of 500 MCPs to database...`);
          MCPCacheRepository.saveBatch(allMCPs.slice(-500));
        }

        // Pequena pausa entre requisições para não sobrecarregar a API
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Aumentar tamanho da página progressivamente para otimizar
        if (page === 5 && COUNT_PER_PAGE === 100) {
          COUNT_PER_PAGE = 500;
          console.log("🚀 Increasing page size to 500 for faster download");
        } else if (page === 20 && COUNT_PER_PAGE === 500) {
          COUNT_PER_PAGE = 1000;
          console.log("🚀 Increasing page size to 1000 for maximum efficiency");
        }

        // Log de progresso a cada 10 páginas
        if (page % 10 === 0) {
          console.log(
            `📈 Progress: ${allMCPs.length} MCPs downloaded (page ${page})`
          );
        }
      } catch (error: any) {
        console.error(`❌ Error downloading page ${page + 1}:`, error);

        // Se for erro de abort, parar
        if (this.abortController?.signal.aborted) {
          console.log("🛑 Download cancelled");
          break;
        }

        // Se for erro de rede, tentar continuar
        if (
          error.message.includes("fetch") ||
          error.message.includes("network")
        ) {
          console.log("🔄 Network error, retrying in 2 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }

        // Para outros erros, parar
        throw error;
      }
    }

    // Salvar último batch se houver
    if (allMCPs.length > 0) {
      const remainingItems = allMCPs.length % 500;
      if (remainingItems > 0) {
        console.log(`💾 Saving final batch of ${remainingItems} MCPs...`);
        MCPCacheRepository.saveBatch(allMCPs.slice(-remainingItems));
      }
    }

    console.log(
      `✅ Download completed: ${allMCPs.length} total MCPs downloaded`
    );
    return allMCPs;
  }

  /**
   * Verificar se precisa sincronizar
   */
  static needsSync(): boolean {
    return MCPCacheRepository.needsSync();
  }

  /**
   * Obter estatísticas do cache
   */
  static getCacheStats() {
    return MCPCacheRepository.getStats();
  }

  /**
   * Forçar limpeza do cache
   */
  static clearCache(): void {
    MCPCacheRepository.clearCache();
    console.log("🗑️ Cache cleared");
  }

  /**
   * Verificar saúde do sistema de cache
   */
  static async healthCheck(): Promise<{
    cacheExists: boolean;
    cacheValid: boolean;
    totalItems: number;
    lastSync: number | null;
    needsSync: boolean;
  }> {
    try {
      const cacheExists = MCPCacheRepository.tableExists(
        "mcp_marketplace_cache"
      );
      const stats = MCPCacheRepository.getStats();
      const needsSync = MCPCacheRepository.needsSync();

      return {
        cacheExists,
        cacheValid: stats.isValid,
        totalItems: stats.totalItems,
        lastSync: stats.lastSync,
        needsSync,
      };
    } catch (error) {
      console.error("Health check failed:", error);
      return {
        cacheExists: false,
        cacheValid: false,
        totalItems: 0,
        lastSync: null,
        needsSync: true,
      };
    }
  }
}
