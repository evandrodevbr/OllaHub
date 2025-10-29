import { NextResponse } from "next/server";
import { MCPRepository } from "@/database/repositories/mcp";

export async function PUT(request: Request) {
  try {
    const { mcpId, newConfig } = await request.json();

    if (!mcpId) {
      return NextResponse.json(
        { success: false, error: "MCP ID is required" },
        { status: 400 }
      );
    }

    if (!newConfig) {
      return NextResponse.json(
        { success: false, error: "New configuration is required" },
        { status: 400 }
      );
    }

    console.log(`Updating config for MCP: ${mcpId}`);

    // Verificar se o MCP está instalado
    if (!MCPRepository.isInstalled(mcpId)) {
      return NextResponse.json(
        {
          success: false,
          error: `MCP ${mcpId} is not installed`,
        },
        { status: 404 }
      );
    }

    // Atualizar configuração
    MCPRepository.updateConfig(mcpId, newConfig);

    console.log(`MCP ${mcpId} configuration updated successfully`);

    return NextResponse.json({
      success: true,
      message: `MCP ${mcpId} configuration updated successfully`,
      mcpId,
    });
  } catch (error: any) {
    console.error("Error updating MCP configuration:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update MCP configuration" },
      { status: 500 }
    );
  }
}
