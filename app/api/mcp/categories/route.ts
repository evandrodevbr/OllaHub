import { NextResponse } from "next/server";
import { MCPCacheRepository } from "@/database/repositories/mcp-cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/mcp/categories - Obter categorias dinâmicas do cache
 */
export async function GET(request: Request) {
  try {
    console.log("📊 Fetching dynamic categories from cache...");

    // Verificar se cache existe e tem dados
    const cacheExists = MCPCacheRepository.tableExists("mcp_marketplace_cache");
    if (!cacheExists) {
      return NextResponse.json({
        success: false,
        error: "Cache not initialized",
        categories: {
          primary: [],
          others: [],
        },
      });
    }

    // Obter categorias dinâmicas
    const categories = MCPCacheRepository.getCategories();
    const stats = MCPCacheRepository.getCategoryStats();

    // Verificar se há dados no cache
    if (stats.totalMCPs === 0) {
      return NextResponse.json({
        success: false,
        error: "No MCPs found in cache",
        categories: {
          primary: [],
          others: [],
        },
        stats,
      });
    }

    console.log(
      `📊 Categories extracted: ${categories.primary.length} primary, ${categories.others.length} others`
    );

    return NextResponse.json({
      success: true,
      categories,
      stats,
      lastSync: MCPCacheRepository.getLastSync(),
      cacheValid: MCPCacheRepository.isCacheValid(),
    });
  } catch (error: any) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch categories",
        categories: {
          primary: [],
          others: [],
        },
      },
      { status: 500 }
    );
  }
}
