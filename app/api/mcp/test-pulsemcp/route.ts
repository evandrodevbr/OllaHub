import { NextResponse } from "next/server";
import { PulseMCPService } from "@/lib/services/pulsemcp";

const PULSEMCP_API_BASE = "https://api.pulsemcp.com/v0beta";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    console.log("🔍 Testando PulseMCP API diretamente...");

    // Chamar API PulseMCP diretamente
    const response = await fetch(
      `${PULSEMCP_API_BASE}/servers?${new URLSearchParams({
        count_per_page: limit.toString(),
        offset: offset.toString(),
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
    console.log(
      `✅ PulseMCP API respondeu com ${data.servers.length} servidores`
    );

    // Transformar para formato interno
    const mcps = data.servers.map((item: any) =>
      PulseMCPService.transformToMCPProvider(item)
    );

    return NextResponse.json({
      success: true,
      mcps: mcps,
      total: data.total_count,
      hasMore: data.total_count > offset + limit,
      source: "pulsemcp-direct",
      message: `Listando ${mcps.length} servidores diretamente da API PulseMCP`,
    });
  } catch (error: any) {
    console.error("❌ Erro ao chamar PulseMCP API:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        mcps: [],
        total: 0,
        source: "pulsemcp-direct-error",
      },
      { status: 500 }
    );
  }
}
