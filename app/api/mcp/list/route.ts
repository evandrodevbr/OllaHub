import { NextResponse } from "next/server";
import {
  MCPProvider,
  MCPSearchParams,
  DeepNLPSearchParams,
} from "@/lib/types/mcp";
import { DeepNLPService } from "@/lib/services/deepnlp";
import { MCPRepository } from "@/database/repositories/mcp";
import { MCPCacheRepository } from "@/database/repositories/mcp-cache";
import { MCPSyncService } from "@/lib/services/mcp-sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || undefined;
    const search = searchParams.get("search") || undefined;
    const sort =
      (searchParams.get("sort") as MCPSearchParams["sort"]) || "rating";
    const order = (searchParams.get("order") as "asc" | "desc") || "desc";
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "2000"); // Aumentado para 2000

    console.log("MCP List API called with params:", {
      category,
      search,
      sort,
      order,
      page,
      limit,
    });

    // 1. Verificar se cache do DB é válido
    const cacheValid = MCPCacheRepository.isCacheValid();

    if (!cacheValid) {
      // Iniciar sincronização em background se necessário
      if (!MCPSyncService.isSyncing()) {
        console.log("Cache invalid, starting background sync...");
        MCPSyncService.backgroundSync().catch(console.error);
      }
    }

    // 2. Tentar buscar do banco de dados primeiro
    const cachedMcps = MCPCacheRepository.search({
      query: search,
      category: category !== "all" ? category : undefined,
      limit,
      offset: page * limit,
      sortBy: sort,
      order: order,
    });

    if (cachedMcps.length > 0 || cacheValid) {
      console.log(`Found ${cachedMcps.length} MCPs in cache`);

      // Transformar para formato interno
      const mcps = cachedMcps.map((item) =>
        DeepNLPService.transformToMCPProvider(item)
      );

      // Adicionar status de instalação
      const installedMCPs = MCPRepository.listInstalled();
      const mcpsWithStatus = mcps.map((mcp) => ({
        ...mcp,
        installed: installedMCPs.includes(mcp.id),
      }));

      const total = MCPCacheRepository.count({
        category: category !== "all" ? category : undefined,
      });

      return NextResponse.json({
        success: true,
        mcps: mcpsWithStatus,
        total,
        hasMore: (page + 1) * limit < total,
        cached: true,
        lastSync: MCPCacheRepository.getLastSync(),
      });
    }

    // 3. Fallback: buscar da API se cache vazio
    console.log("Cache empty, falling back to DeepNLP API");

    const deepnlpCategory =
      category && category !== "all"
        ? DeepNLPService.getCategoryMapping(category)
        : undefined;

    const deepnlpParams: DeepNLPSearchParams = {
      query: search,
      category: deepnlpCategory,
      page_id: page,
      count_per_page: limit,
      mode: "list",
    };

    console.log("Calling DeepNLP API with params:", deepnlpParams);

    const response = await DeepNLPService.searchMCPs(deepnlpParams);
    const mcps = response.items.map((item) =>
      DeepNLPService.transformToMCPProvider(item)
    );

    // Adicionar status de instalação
    const installedMCPs = MCPRepository.listInstalled();
    const mcpsWithStatus = mcps.map((mcp) => ({
      ...mcp,
      installed: installedMCPs.includes(mcp.id),
    }));

    return NextResponse.json({
      success: true,
      mcps: mcpsWithStatus,
      total: response.total_hits,
      hasMore: response.total_hits > (page + 1) * limit,
      cached: false,
    });
  } catch (error: any) {
    console.error("Error fetching MCPs from DeepNLP:", error);

    // Fallback para dados mock em caso de erro
    console.log("Falling back to mock data due to API error");

    const mockMCPs: MCPProvider[] = [
      {
        id: "google-maps/google-maps",
        name: "Google Maps",
        author: "Google",
        description:
          "Google Maps Location services, directions, and place details",
        version: "1.0.0",
        category: "map",
        tags: ["maps", "location", "directions"],
        rating: 4.5,
        totalRatings: 2,
        downloads: 20,
        capabilities: ["geocoding", "directions", "places"],
        repository:
          "https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps",
        installed: false,
        subfield: "MAP",
        field: "MCP SERVER",
      },
    ];

    return NextResponse.json({
      success: true,
      mcps: mockMCPs,
      total: mockMCPs.length,
      hasMore: false,
      fallback: true,
      error: error.message,
    });
  }
}
