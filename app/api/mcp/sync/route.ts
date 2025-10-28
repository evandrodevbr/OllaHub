import { NextResponse } from "next/server";
import { MCPSyncService } from "@/lib/services/mcp-sync";
import { MCPCacheRepository } from "@/database/repositories/mcp-cache";

export const dynamic = "force-dynamic";

/**
 * POST /api/mcp/sync - Iniciar sincronização manual
 */
export async function POST(request: Request) {
  try {
    if (MCPSyncService.isSyncing()) {
      return NextResponse.json({
        success: false,
        error: "Sync already in progress"
      }, { status: 409 });
    }

    console.log("🔄 Starting manual MCP sync...");
    
    const result = await MCPSyncService.syncAll((progress) => {
      console.log(`📥 Progress: ${progress.current}/${progress.total} (${progress.page}/${progress.totalPages} pages)`);
    });

    return NextResponse.json({
      success: result.success,
      totalDownloaded: result.totalDownloaded,
      errors: result.errors,
      duration: result.duration
    });
  } catch (error: any) {
    console.error("Manual sync failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to sync MCPs" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mcp/sync - Obter status da sincronização
 */
export async function GET(request: Request) {
  try {
    const stats = MCPCacheRepository.getStats();
    const healthCheck = await MCPSyncService.healthCheck();
    
    return NextResponse.json({
      isSyncing: MCPSyncService.isSyncing(),
      lastSync: stats.lastSync,
      totalCached: stats.totalItems,
      needsSync: MCPCacheRepository.needsSync(),
      cacheValid: stats.isValid,
      categories: stats.categories,
      healthCheck
    });
  } catch (error: any) {
    console.error("Error getting sync status:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to get sync status" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mcp/sync - Cancelar sincronização atual
 */
export async function DELETE(request: Request) {
  try {
    if (!MCPSyncService.isSyncing()) {
      return NextResponse.json({
        success: false,
        error: "No sync in progress"
      }, { status: 400 });
    }

    MCPSyncService.cancelSync();
    
    return NextResponse.json({
      success: true,
      message: "Sync cancelled successfully"
    });
  } catch (error: any) {
    console.error("Error cancelling sync:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to cancel sync" },
      { status: 500 }
    );
  }
}
