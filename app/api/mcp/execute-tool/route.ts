/**
 * API endpoint para executar um tool de MCP
 */

import { NextRequest, NextResponse } from "next/server";
import { MCPExecutor } from "@/lib/services/mcp-executor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mcpId, toolName, parameters } = body;

    // Validar parâmetros
    if (!mcpId || !toolName) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing mcpId or toolName",
        },
        { status: 400 }
      );
    }

    console.log(`📞 API call to execute tool: ${mcpId}.${toolName}`);

    // Obter tools disponíveis
    const availableTools = MCPExecutor.getAvailableTools(mcpId);
    const tool = availableTools.find((t) => t.name === toolName);

    if (!tool) {
      return NextResponse.json(
        {
          success: false,
          error: `Tool ${toolName} not found in MCP ${mcpId}`,
        },
        { status: 404 }
      );
    }

    // Validar parâmetros contra schema
    const validation = MCPExecutor.validateParameters(parameters || {}, tool);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid parameters: ${validation.error}`,
        },
        { status: 400 }
      );
    }

    // Executar tool
    const result = await MCPExecutor.executeMCPTool(
      mcpId,
      toolName,
      parameters || {}
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          executionTime: result.executionTime,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mcpId,
      toolName,
      result: result.result,
      executionTime: result.executionTime,
    });
  } catch (error: any) {
    console.error("Error executing MCP tool:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to execute MCP tool",
      },
      { status: 500 }
    );
  }
}
