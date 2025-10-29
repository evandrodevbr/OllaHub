import { NextResponse } from "next/server";
import { DeepNLPService } from "@/lib/services/deepnlp";
import { MCPCacheRepository } from "@/database/repositories/mcp-cache";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mcpId = searchParams.get("mcpId");

    if (!mcpId) {
      return NextResponse.json(
        { success: false, error: "MCP ID is required" },
        { status: 400 }
      );
    }

    console.log(`Fetching server config for: ${mcpId}`);

    // Primeiro, tentar buscar do cache local (PulseMCP)
    const [owner, repo] = mcpId.includes("/") ? mcpId.split("/") : ["", mcpId];

    // Buscar no cache usando ID completo ou apenas repo
    const cachedMcps = MCPCacheRepository.search({
      query: repo,
      limit: 1,
    });

    if (cachedMcps.length > 0) {
      const cachedMCP = cachedMcps[0];

      // Verificar se tem configuração no ext_info
      if (cachedMCP.ext_info) {
        try {
          const extInfo =
            typeof cachedMCP.ext_info === "string"
              ? JSON.parse(cachedMCP.ext_info)
              : cachedMCP.ext_info;

          if (
            extInfo.config &&
            Array.isArray(extInfo.config) &&
            extInfo.config.length > 0
          ) {
            console.log(`Found config in cache for ${mcpId}`);
            // Converter formato PulseMCP para formato esperado pelo modal
            const serverConfig = extInfo.config.find(
              (c: any) => c.type === "server"
            );
            const envConfig = extInfo.config.find((c: any) => c.type === "env");

            if (serverConfig) {
              // Usar o nome do servidor config como chave
              const serverName =
                serverConfig.name || extInfo.package_name || cachedMCP.id;

              const formattedConfig = {
                mcpServers: {
                  [serverName]: {
                    command: serverConfig.command || "npx",
                    args: serverConfig.args || [],
                    env: envConfig?.variables || {},
                  },
                },
              };

              return NextResponse.json({
                success: true,
                config: formattedConfig,
                source: "pulsemcp",
              });
            }
          }
        } catch (error) {
          console.error("Error parsing ext_info:", error);
        }
      }
    }

    // Se não encontrou no cache, tentar DeepNLP como fallback
    try {
      const serverConfig = await DeepNLPService.getServerConfig(mcpId);

      if (serverConfig.items && serverConfig.items.length > 0) {
        console.log(`Found config from DeepNLP for ${mcpId}`);
        return NextResponse.json({
          success: true,
          config: serverConfig.items[0],
          source: "deepnlp",
        });
      }
    } catch (error) {
      console.log(`DeepNLP lookup failed for ${mcpId}, continuing...`);
    }

    // Se não encontrou configuração em nenhum lugar, retornar config vazio
    console.log(`No config found for ${mcpId}, returning empty config`);
    return NextResponse.json({
      success: true,
      config: null,
      source: "none",
    });
  } catch (error: any) {
    console.error("Error fetching server config:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch server config",
      },
      { status: 500 }
    );
  }
}
