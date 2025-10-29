import { NextResponse } from "next/server";
import { MCPRepository } from "@/database/repositories/mcp";
import { MCPEnvironmentService } from "@/lib/services/mcp-environment";

export async function DELETE(request: Request) {
  try {
    const { mcpId } = await request.json();

    if (!mcpId) {
      return NextResponse.json(
        { success: false, error: "MCP ID is required" },
        { status: 400 }
      );
    }

    console.log(`🗑️ Uninstalling MCP: ${mcpId}`);

    // Verificar se está instalado
    if (!MCPRepository.isInstalled(mcpId)) {
      return NextResponse.json(
        {
          success: false,
          error: `MCP ${mcpId} is not installed`,
        },
        { status: 400 }
      );
    }

    // Obter ambiente antes de remover do banco
    const environment = MCPRepository.getEnvironment(mcpId);

    // Remover do banco local
    MCPRepository.removeInstallation(mcpId);

    console.log(`✓ MCP ${mcpId} removed from database`);

    // Limpar arquivos de instalação se ambiente existe
    if (environment) {
      try {
        await MCPEnvironmentService.cleanupEnvironment(environment);
        console.log(`✓ MCP ${mcpId} environment cleaned up`);
      } catch (error: any) {
        console.warn(
          `⚠️ Could not clean up environment for ${mcpId}: ${error.message}`
        );
        // Não falhar a desinstalação se limpeza falhar
      }
    }

    return NextResponse.json({
      success: true,
      message: `MCP ${mcpId} uninstalled successfully`,
      mcpId,
    });
  } catch (error: any) {
    console.error("Error uninstalling MCP:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to uninstall MCP" },
      { status: 500 }
    );
  }
}
