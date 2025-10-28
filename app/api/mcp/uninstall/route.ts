import { NextResponse } from "next/server";
import { MCPInstallationStatus } from "@/lib/types/mcp";
import { MCPRepository } from "@/database/repositories/mcp";

export async function DELETE(request: Request) {
  try {
    const { mcpId } = await request.json();

    if (!mcpId) {
      return NextResponse.json(
        { success: false, error: "MCP ID is required" },
        { status: 400 }
      );
    }

    console.log(`Uninstalling MCP: ${mcpId}`);

    // Verificar se está instalado
    if (!MCPRepository.isInstalled(mcpId)) {
      return NextResponse.json({
        success: false,
        error: `MCP ${mcpId} is not installed`,
      }, { status: 400 });
    }

    // Remover do banco local
    MCPRepository.removeInstallation(mcpId);

    const result: MCPInstallationStatus = {
      success: true,
      message: `MCP ${mcpId} uninstalled successfully`,
      mcpId,
    };

    return NextResponse.json({
      success: true,
      installation: result,
    });
  } catch (error: any) {
    console.error("Error uninstalling MCP:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to uninstall MCP" },
      { status: 500 }
    );
  }
}
