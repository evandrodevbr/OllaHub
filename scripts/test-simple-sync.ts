import { MCPCacheRepository } from "../database/repositories/mcp-cache";
import { MCPSyncService } from "../lib/services/mcp-sync";
import { PulseMCPService } from "../lib/services/pulsemcp";

async function testSimpleSync() {
  console.log("🔄 Testando sincronização simples com PulseMCP...");

  try {
    // 1. Verificar se PulseMCP API está funcionando
    console.log("🔍 Verificando conectividade com PulseMCP API...");
    const isHealthy = await PulseMCPService.checkHealth();

    if (!isHealthy) {
      console.error("❌ PulseMCP API não está acessível");
      return;
    }

    console.log("✅ PulseMCP API está funcionando");

    // 2. Limpar cache antigo
    console.log("🗑️ Limpando cache antigo...");
    MCPCacheRepository.clearCache();
    console.log("✅ Cache antigo limpo");

    // 3. Testar chamada direta à API
    console.log("📡 Testando chamada direta à API PulseMCP...");
    const response = await PulseMCPService.getAllServers();
    console.log(
      `✅ API retornou ${response.servers.length} servidores (total: ${response.total_count})`
    );

    // 4. Salvar alguns servidores no banco para teste
    console.log("💾 Salvando primeiros 10 servidores no banco...");
    const testBatch = response.servers.slice(0, 10);
    MCPCacheRepository.saveBatch(testBatch);
    console.log("✅ Servidores salvos no banco");

    // 5. Verificar se foram salvos corretamente
    console.log("🔍 Verificando dados salvos...");
    const savedServers = MCPCacheRepository.search({ limit: 10 });
    console.log(`📋 Encontrados ${savedServers.length} servidores no banco:`);

    savedServers.forEach((server, index) => {
      console.log(
        `   ${index + 1}. ${server.content_name} (${server.category})`
      );
    });

    // 6. Testar sincronização completa
    console.log("🚀 Iniciando sincronização completa...");
    const result = await MCPSyncService.syncAll((progress) => {
      const percentage =
        progress.total > 0
          ? Math.round((progress.current / progress.total) * 100)
          : 0;
      console.log(
        `📊 Progresso: ${progress.current}/${progress.total} (${percentage}%)`
      );
    });

    if (result.success) {
      console.log(`✅ Sincronização concluída com sucesso!`);
      console.log(`📊 Total de servidores baixados: ${result.totalDownloaded}`);
      console.log(`⏱️ Tempo total: ${Math.round(result.duration / 1000)}s`);

      // 7. Verificar estatísticas finais
      const stats = MCPCacheRepository.getStats();
      console.log(`📈 Estatísticas finais do cache:`);
      console.log(`   - Total de itens: ${stats.totalItems}`);
      console.log(
        `   - Última sincronização: ${
          stats.lastSync ? new Date(stats.lastSync).toLocaleString() : "Nunca"
        }`
      );
      console.log(`   - Cache válido: ${stats.isValid ? "Sim" : "Não"}`);
    } else {
      console.error("❌ Sincronização falhou:");
      result.errors.forEach((error) => console.error(`   - ${error}`));
    }
  } catch (error) {
    console.error("❌ Erro durante teste:", error);
  }
}

testSimpleSync();

export { testSimpleSync };
