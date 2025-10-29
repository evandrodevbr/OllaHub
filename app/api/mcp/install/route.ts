import { NextResponse } from "next/server";
import { MCPRepository } from "@/database/repositories/mcp";
import { MCPInstallerService } from "@/lib/services/mcp-installer";
import { MCPValidatorService } from "@/lib/services/mcp-validator";
import { DeepNLPService } from "@/lib/services/deepnlp";
import { PulseMCPService } from "@/lib/services/pulsemcp";
import { MCPCacheRepository } from "@/database/repositories/mcp-cache";
import type {
  InstallationConfig,
  InstallationProgress,
} from "@/lib/types/mcp-installer";

export async function POST(request: Request) {
  try {
    const { mcpId, customConfig, enableLogs } = await request.json();

    if (!mcpId) {
      return NextResponse.json(
        { success: false, error: "MCP ID is required" },
        { status: 400 }
      );
    }

    console.log(`🚀 Starting installation for MCP: ${mcpId}`);

    // Verificar se já está instalado
    if (MCPRepository.isInstalled(mcpId)) {
      const existing = MCPRepository.getInstalledMCP(mcpId);

      // Se já está instalado e pronto, retornar erro
      if (existing.status === "ready") {
        return NextResponse.json(
          {
            success: false,
            error: `MCP ${mcpId} is already installed`,
          },
          { status: 400 }
        );
      }

      // Se está em processo de instalação ou falhou, permitir reinstalação
      console.log(
        `Re-installing MCP ${mcpId} (current status: ${existing.status})`
      );
    }

    // Obter configuração
    let serverConfig: any;
    let packageName: string;
    let packageRegistry: string | null = null;
    let repositoryUrl: string | undefined;

    if (customConfig) {
      // Usar configuração personalizada
      console.log(`Using custom configuration for ${mcpId}`);
      serverConfig = customConfig;
      packageName = customConfig.packageName || mcpId;
      packageRegistry = customConfig.packageRegistry || null;
      repositoryUrl = customConfig.repositoryUrl;
    } else {
      // Buscar configuração da API
      console.log(`Fetching configuration for ${mcpId}`);

      try {
        // Tentar DeepNLP primeiro
        const deepnlpConfig = await DeepNLPService.getServerConfig(mcpId);
        if (deepnlpConfig.items && deepnlpConfig.items.length > 0) {
          serverConfig = deepnlpConfig.items[0];
        }
      } catch (error) {
        console.log(`DeepNLP config not found, trying cache...`);
      }

      // Se não encontrou, tentar cache PulseMCP
      if (!serverConfig) {
        const cachedMCP = MCPCacheRepository.findById(mcpId);
        if (cachedMCP) {
          serverConfig = PulseMCPService.transformToMCPProvider(cachedMCP);
          packageName = cachedMCP.package_name || mcpId;
          packageRegistry = cachedMCP.package_registry;
          repositoryUrl = cachedMCP.source_code_url;
        }
      }

      if (!serverConfig) {
        throw new Error(`No configuration found for MCP ${mcpId}`);
      }

      // Extrair informações do pacote
      packageName = serverConfig.packageName || serverConfig.name || mcpId;
    }

    // Preparar configuração de instalação
    const installConfig: InstallationConfig = {
      mcpId,
      packageName,
      packageRegistry: packageRegistry as any,
      repositoryUrl,
      config: serverConfig,
      enableLogs: enableLogs === true,
    };

    // Salvar como PENDING no banco
    if (!MCPRepository.isInstalled(mcpId)) {
      MCPRepository.saveInstallation(mcpId, serverConfig, []);
    }
    MCPRepository.updateInstallationStatus(
      mcpId,
      "pending",
      "Starting installation..."
    );

    // Iniciar instalação em background
    installInBackground(installConfig);

    return NextResponse.json({
      success: true,
      message: "Installation started",
      mcpId,
      status: "pending",
    });
  } catch (error: any) {
    console.error("Error starting installation:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to start installation",
      },
      { status: 500 }
    );
  }
}

/**
 * Executa instalação em background (não bloqueia resposta HTTP)
 */
async function installInBackground(config: InstallationConfig): Promise<void> {
  const { mcpId, enableLogs } = config;

  try {
    console.log(`📦 Installing ${mcpId} in background...`);

    // Callback de progresso
    const onProgress = (progress: InstallationProgress) => {
      MCPRepository.updateInstallationStatus(
        mcpId,
        progress.status,
        progress.message
      );

      if (enableLogs && progress.logs && progress.logs.length > 0) {
        MCPRepository.appendLogs(mcpId, progress.logs);
      }

      console.log(
        `[${mcpId}] ${progress.status}: ${progress.message} (${progress.percentage}%)`
      );
    };

    // Instalar
    onProgress({
      status: "downloading",
      message: "Preparing installation...",
      percentage: 5,
    });

    const environment = await MCPInstallerService.install(config, onProgress);

    // Salvar ambiente
    MCPRepository.saveEnvironment(mcpId, environment);

    onProgress({
      status: "testing",
      message: "Validating MCP server...",
      percentage: 85,
    });

    // Validar servidor MCP
    const validation = await MCPValidatorService.validateMCPServer(
      environment,
      config.config
    );

    // Salvar resultado de validação
    MCPRepository.saveValidationResult(mcpId, validation);

    if (validation.success) {
      // Salvar ferramentas descobertas
      MCPRepository.saveTools(mcpId, validation.tools);

      MCPRepository.updateInstallationStatus(
        mcpId,
        "ready",
        `Installed successfully with ${validation.tools.length} tools`
      );

      console.log(`✅ MCP ${mcpId} installed and validated successfully`);
    } else {
      // Validação falhou, mas instalação pode estar OK
      console.warn(
        `⚠️ MCP ${mcpId} installed but validation failed: ${validation.error}`
      );

      // Tentar validação simples como fallback
      const simpleValidation = await MCPValidatorService.simpleValidation(
        environment,
        config.config
      );

      if (simpleValidation.success) {
        MCPRepository.updateInstallationStatus(
          mcpId,
          "ready",
          "Installed (validation partial)"
        );
        console.log(`✅ MCP ${mcpId} installed (simple validation passed)`);
      } else {
        throw new Error(
          validation.error || simpleValidation.error || "Validation failed"
        );
      }
    }
  } catch (error: any) {
    console.error(`❌ Installation failed for ${mcpId}:`, error);

    MCPRepository.updateInstallationStatus(
      mcpId,
      "failed",
      error.message || "Installation failed"
    );

    if (enableLogs) {
      MCPRepository.appendLogs(mcpId, [
        `ERROR: ${error.message}`,
        error.stack || "",
      ]);
    }
  }
}
