import { NextResponse } from "next/server";
import { MCPInstallationStatus } from "@/lib/types/mcp";
import { DeepNLPService } from "@/lib/services/deepnlp";
import { MCPRepository } from "@/database/repositories/mcp";

export async function POST(request: Request) {
  try {
    const { mcpId } = await request.json();

    if (!mcpId) {
      return NextResponse.json(
        { success: false, error: "MCP ID is required" },
        { status: 400 }
      );
    }

    console.log(`Installing MCP: ${mcpId}`);

    // Verificar se já está instalado
    if (MCPRepository.isInstalled(mcpId)) {
      return NextResponse.json({
        success: false,
        error: `MCP ${mcpId} is already installed`,
      }, { status: 400 });
    }

    // Obter configuração completa do servidor
    console.log(`Fetching server config for ${mcpId}`);
    const serverConfig = await DeepNLPService.getServerConfig(mcpId);
    
    if (!serverConfig.items || serverConfig.items.length === 0) {
      throw new Error(`No configuration found for MCP ${mcpId}`);
    }

    // Obter ferramentas disponíveis
    console.log(`Fetching server tools for ${mcpId}`);
    const tools = await DeepNLPService.getServerTools(mcpId);

    // Salvar configuração localmente
    console.log(`Saving MCP ${mcpId} to local database`);
    MCPRepository.saveInstallation(mcpId, serverConfig.items[0], tools);

    const result: MCPInstallationStatus = {
      success: true,
      message: `MCP ${mcpId} installed successfully`,
      mcpId,
    };

    return NextResponse.json({
      success: true,
      installation: result,
      config: serverConfig.items[0],
      tools: tools,
    });
  } catch (error: any) {
    console.error("Error installing MCP:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to install MCP" },
      { status: 500 }
    );
  }
}
