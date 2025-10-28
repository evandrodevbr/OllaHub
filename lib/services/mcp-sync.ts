import { PulseMCPService } from "./pulsemcp";
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
   * Download completo de todos os servidores PulseMCP (uma única chamada)
   */
  private static async downloadAllPages(
    onProgress?: (progress: SyncProgress) => void
  ): Promise<any[]> {
    try {
      console.log("📡 Starting complete download from PulseMCP...");

      // Notificar início
      this.currentProgress = {
        current: 0,
        total: 0,
        page: 1,
        totalPages: 1,
      };

      if (onProgress) {
        onProgress(this.currentProgress);
      }

      // Fazer uma única chamada para buscar todos os servidores
      const response = await PulseMCPService.getAllServers();

      console.log(`📊 Total servers available: ${response.total_count}`);
      console.log(`📥 Downloaded ${response.servers.length} servers`);

      // Atualizar progresso
      this.currentProgress = {
        current: response.servers.length,
        total: response.total_count,
        page: 1,
        totalPages: 1,
      };

      if (onProgress) {
        onProgress(this.currentProgress);
      }

      // Salvar em batches de 500 para evitar bloqueio
      const batchSize = 500;
      const totalBatches = Math.ceil(response.servers.length / batchSize);

      for (let i = 0; i < totalBatches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, response.servers.length);
        const batch = response.servers.slice(start, end);

        console.log(
          `💾 Saving batch ${i + 1}/${totalBatches} (${batch.length} items)...`
        );
        MCPCacheRepository.saveBatch(batch);

        // Pequena pausa entre batches
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(
        `✅ Download completed: ${response.servers.length} total MCPs downloaded from PulseMCP`
      );
      return response.servers;
    } catch (error: any) {
      console.error(`❌ Error downloading from PulseMCP:`, error);

      // Se for erro de abort, parar
      if (this.abortController?.signal.aborted) {
        console.log("🛑 Download cancelled");
        return [];
      }

      // Para outros erros, lançar
      throw error;
    }
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
