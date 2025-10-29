import { NextResponse } from "next/server";
import { MCPRepository } from "@/database/repositories/mcp";
import { MCPValidatorService } from "@/lib/services/mcp-validator";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { mcpId } = await request.json();

    if (!mcpId) {
      return NextResponse.json(
        { success: false, error: "MCP ID é obrigatório" },
        { status: 400 }
      );
    }

    console.log(`🧪 Testing MCP server: ${mcpId}`);

    // Buscar dados do MCP no banco
    const mcpData = MCPRepository.getInstalledMCP(mcpId);
    if (!mcpData) {
      return NextResponse.json(
        { success: false, error: "MCP não encontrado" },
        { status: 404 }
      );
    }

    // Obter ambiente de instalação
    const environment = MCPRepository.getEnvironment(mcpId);

    if (!environment) {
      return NextResponse.json(
        {
          success: false,
          error:
            "MCP não está instalado corretamente. Ambiente não encontrado.",
        },
        { status: 400 }
      );
    }

    console.log(
      `Testing environment: ${environment.executable} ${environment.args?.join(
        " "
      )}`
    );

    // Validar servidor usando protocolo JSON-RPC MCP
    const validationResult = await MCPValidatorService.validateMCPServer(
      environment,
      mcpData.config
    );

    // Salvar resultado da validação
    MCPRepository.saveValidationResult(mcpId, validationResult);

    if (validationResult.success) {
      // Atualizar ferramentas se validação foi bem-sucedida
      if (validationResult.tools && validationResult.tools.length > 0) {
        MCPRepository.saveTools(mcpId, validationResult.tools);
      }

      console.log(`✅ Test successful for ${mcpId}:`, {
        protocol: validationResult.protocol,
        tools: validationResult.tools.length,
      });

      return NextResponse.json({
        success: true,
        result: {
          success: true,
          protocol: validationResult.protocol,
          toolsCount: validationResult.tools.length,
          tools: validationResult.tools,
          capabilities: validationResult.capabilities,
        },
      });
    }

    // Se validação falhou, tentar validação simples
    console.warn(`⚠️ JSON-RPC validation failed, trying simple validation...`);

    const simpleResult = await MCPValidatorService.simpleValidation(
      environment,
      mcpData.config,
      5000
    );

    if (simpleResult.success) {
      console.log(`✅ Simple validation passed for ${mcpId}`);

      return NextResponse.json({
        success: true,
        result: {
          success: true,
          protocol: "unknown",
          message: "Server starts but JSON-RPC validation failed",
          toolsCount: 0,
          tools: [],
        },
      });
    }

    // Ambas validações falharam
    console.error(`❌ All validations failed for ${mcpId}`);

    return NextResponse.json({
      success: false,
      error:
        validationResult.error || simpleResult.error || "Validation failed",
      result: {
        success: false,
        protocol: validationResult.protocol,
        error: validationResult.error,
      },
    });
  } catch (error: any) {
    console.error("Error testing MCP server:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
