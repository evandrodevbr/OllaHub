import { NextResponse } from "next/server";
import {
  MCPProvider,
  MCPSearchParams,
  PulseMCPSearchParams,
} from "@/lib/types/mcp";
import { PulseMCPService } from "@/lib/services/pulsemcp";
import { MCPRepository } from "@/database/repositories/mcp";
import { MCPCacheRepository } from "@/database/repositories/mcp-cache";
import { MCPSyncService } from "@/lib/services/mcp-sync";

const PULSEMCP_API_BASE = "https://api.pulsemcp.com/v0beta";

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

      // Os dados já estão no formato interno após transformação no saveBatch
      const mcps = cachedMcps.map((item) => {
        // Construir ID no formato owner/repo a partir dos campos do cache
        // Se owner estiver vazio, usar apenas o repo
        const correctId =
          item.owner && item.owner.trim() !== ""
            ? `${item.owner}/${item.repo}`
            : item.repo;

        return {
          id: correctId, // Usar owner/repo como ID principal ou apenas repo se owner vazio
          originalId: item.id, // Manter ID original para referência
          owner: item.owner || "",
          repo: item.repo,
          name: item.content_name,
          author: item.publisher_id,
          description: item.description || "",
          version: "1.0.0",
          category: item.category as MCPProvider["category"],
          tags: item.content_tag_list ? item.content_tag_list.split(",") : [],
          rating: item.rating,
          totalRatings: item.review_cnt,
          repository: item.detail_url || "",
          homepage: item.website || "",
          installed: false, // Será definido abaixo
          subfield: item.subfield || "",
          field: item.field || "",
          config: [],
          tools: [],
        };
      });

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

    // 3. Fallback: buscar da API PulseMCP se cache vazio
    console.log("Cache empty, falling back to PulseMCP API");

    const pulseMCPParams: PulseMCPSearchParams = {
      query: search,
      count_per_page: limit,
      offset: page * limit,
    };

    console.log("Calling PulseMCP API with params:", pulseMCPParams);

    const response = await fetch(
      `${PULSEMCP_API_BASE}/servers?${new URLSearchParams({
        ...(search && { query: search }),
        count_per_page: limit.toString(),
        offset: (page * limit).toString(),
      })}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Ollahub-MCP-Client/1.0 (https://ollahub.com)",
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `PulseMCP API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const mcps = data.servers.map((item: any) =>
      PulseMCPService.transformToMCPProvider(item)
    );

    // Adicionar status de instalação
    const installedMCPs = MCPRepository.listInstalled();
    const mcpsWithStatus = mcps.map((mcp: MCPProvider) => ({
      ...mcp,
      installed: installedMCPs.includes(mcp.id),
    }));

    return NextResponse.json({
      success: true,
      mcps: mcpsWithStatus,
      total: data.total_count,
      hasMore: data.total_count > (page + 1) * limit,
      cached: false,
    });
  } catch (error: any) {
    console.error("Error fetching MCPs from PulseMCP:", error);

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
        repository:
          "https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps",
        installed: false,
        subfield: "MAP",
        field: "MCP SERVER",
        config: [],
        tools: [],
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
