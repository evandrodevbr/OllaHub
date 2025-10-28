#!/usr/bin/env tsx

import { MCPSyncService } from "../lib/services/mcp-sync";
import { MCPCacheRepository } from "../database/repositories/mcp-cache";
import { PulseMCPService } from "../lib/services/pulsemcp";

async function forcePulseMCPSync() {
  console.log("🔄 Forçando sincronização completa com PulseMCP...");

  try {
    // 1. Verificar se PulseMCP API está funcionando
    console.log("🔍 Verificando conectividade com PulseMCP API...");
    const isHealthy = await PulseMCPService.checkHealth();

    if (!isHealthy) {
      console.error("❌ PulseMCP API não está acessível");
      return;
    }

    console.log("✅ PulseMCP API está funcionando");

    // 2. Limpar cache antigo completamente
    console.log("🗑️ Limpando cache antigo do DeepNLP...");
    MCPCacheRepository.clearCache();
    console.log("✅ Cache antigo limpo");

    // 3. Forçar sincronização completa
    console.log("📥 Iniciando download completo de servidores PulseMCP...");

    const result = await MCPSyncService.syncAll((progress) => {
      const percentage =
        progress.total > 0
          ? Math.round((progress.current / progress.total) * 100)
          : 0;
      console.log(
        `📊 Progresso: ${progress.current}/${progress.total} (${percentage}%) - Página ${progress.page}/${progress.totalPages}`
      );
    });

    if (result.success) {
      console.log(`✅ Sincronização concluída com sucesso!`);
      console.log(`📊 Total de servidores baixados: ${result.totalDownloaded}`);
      console.log(`⏱️ Tempo total: ${Math.round(result.duration / 1000)}s`);

      // 4. Verificar estatísticas do cache
      const stats = MCPCacheRepository.getStats();
      console.log(`📈 Estatísticas do cache:`);
      console.log(`   - Total de itens: ${stats.totalItems}`);
      console.log(
        `   - Última sincronização: ${
          stats.lastSync ? new Date(stats.lastSync).toLocaleString() : "Nunca"
        }`
      );
      console.log(`   - Cache válido: ${stats.isValid ? "Sim" : "Não"}`);

      // 5. Testar busca de alguns servidores
      console.log("🔍 Testando busca de servidores...");
      const sampleServers = MCPCacheRepository.search({ limit: 5 });
      console.log(
        `📋 Encontrados ${sampleServers.length} servidores no cache:`
      );

      sampleServers.forEach((server, index) => {
        console.log(
          `   ${index + 1}. ${server.content_name} (${server.category})`
        );
      });
    } else {
      console.error("❌ Sincronização falhou:");
      result.errors.forEach((error) => console.error(`   - ${error}`));
    }
  } catch (error) {
    console.error("❌ Erro durante sincronização:", error);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  forcePulseMCPSync()
    .then(() => {
      console.log("🎉 Script concluído");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Erro fatal:", error);
      process.exit(1);
    });
}

export { forcePulseMCPSync };
