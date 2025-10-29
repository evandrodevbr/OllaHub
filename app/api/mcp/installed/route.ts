import { NextResponse } from "next/server";
import { MCPRepository } from "@/database/repositories/mcp";
// Marketplace cache removido

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("Fetching installed MCPs...");

    // Buscar todos os MCPs instalados com detalhes
    const installedMcps = MCPRepository.listInstalledWithDetails();

    // Retornar dados de instalados sem enriquecimento de marketplace
    const enrichedMcps = installedMcps.map((mcp) => ({
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
    }));

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
