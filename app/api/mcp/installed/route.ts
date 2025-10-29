import { NextResponse } from "next/server";
import { MCPRepository } from "@/database/repositories/mcp";
import { MCPCacheRepository } from "@/database/repositories/mcp-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("Fetching installed MCPs...");

    // Buscar todos os MCPs instalados com detalhes
    const installedMcps = MCPRepository.listInstalledWithDetails();

    // Enriquecer com dados do cache do marketplace
    const enrichedMcps = installedMcps.map((mcp) => {
      // Tentar encontrar no cache usando diferentes critérios
      const cacheEntry =
        MCPCacheRepository.findByOwnerRepo(mcp.owner, mcp.repo) ||
        MCPCacheRepository.findByName(mcp.name) ||
        MCPCacheRepository.findById(mcp.id);

      if (cacheEntry) {
        return {
          ...mcp,
          // Usar dados do cache quando disponíveis
          author:
            cacheEntry.publisher_id !== "Unknown"
              ? cacheEntry.publisher_id
              : mcp.owner,
          description: cacheEntry.description || `MCP instalado: ${mcp.name}`,
          repository: cacheEntry.detail_url || cacheEntry.website,
          homepage: cacheEntry.website,
          rating: cacheEntry.rating || 0,
          totalRatings: cacheEntry.review_cnt || 0,
          category: cacheEntry.category || "other",
          tags: cacheEntry.content_tag_list
            ? cacheEntry.content_tag_list.split(",")
            : [],
        };
      }

      return {
        ...mcp,
        author: mcp.owner !== "unknown" ? mcp.owner : "Unknown",
        description: `MCP instalado: ${mcp.name}`,
        repository: "",
        homepage: "",
        rating: 0,
        totalRatings: 0,
        category: "other",
        tags: [],
        status: mcp.status || "unknown",
        statusMessage: mcp.status_message || "",
      };
    });

    console.log(`Found ${enrichedMcps.length} installed MCPs`);

    return NextResponse.json({
      success: true,
      mcps: enrichedMcps,
      total: enrichedMcps.length,
    });
  } catch (error: any) {
    console.error("Error fetching installed MCPs:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch installed MCPs",
      },
      { status: 500 }
    );
  }
}
