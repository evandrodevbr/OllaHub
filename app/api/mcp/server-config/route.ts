import { NextResponse } from "next/server";
import { DeepNLPService } from "@/lib/services/deepnlp";

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

    // Marketplace removido: pular cache local

    // Tentar DeepNLP
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
