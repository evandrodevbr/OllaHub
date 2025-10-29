/**
 * API endpoint para listar MCPs disponíveis para uso no chat
 */

import { NextResponse } from "next/server";
import { MCPRepository } from "@/database/repositories/mcp";
import { MCPExecutor } from "@/lib/services/mcp-executor";
import type { MCPTool } from "@/lib/types/mcp-chat";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Buscar todos os MCPs instalados com status "ready"
    const allMcps = MCPRepository.getAllInstalled();

    const availableMcps = allMcps
      .filter((mcp: any) => !mcp.status || mcp.status === "ready")
      .map((mcp: any) => {
        const tools = MCPExecutor.getAvailableTools(mcp.id);

        // Converter tools para formato OpenAI function calling
        const toolsFormatted = tools.map((tool: MCPTool) => ({
          type: "function" as const,
          function: {
            name: `${mcp.id}__${tool.name}`, // Prefixar com mcpId para evitar conflitos
            description: tool.description,
            parameters: tool.inputSchema,
          },
        }));

        return {
          mcpId: mcp.id,
          name: mcp.name,
          owner: mcp.owner,
          repo: mcp.repo,
          toolCount: tools.length,
          tools: toolsFormatted,
          rawTools: tools, // Tools originais para referência
        };
      });

    return NextResponse.json({
      success: true,
      mcps: availableMcps,
      count: availableMcps.length,
    });
  } catch (error: any) {
    console.error("Error listing available MCPs:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to list available MCPs",
      },
      { status: 500 }
    );
  }
}
