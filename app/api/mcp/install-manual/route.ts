import { NextResponse } from "next/server";
import { MCPRepository } from "@/database/repositories/mcp";
import { MCPInstallerService } from "@/lib/services/mcp-installer";
import { MCPValidatorService } from "@/lib/services/mcp-validator";
import {
  MCPInstallationStatus,
  type InstallationConfig,
  type InstallationProgress,
  type PackageRegistry,
} from "@/lib/types/mcp-installer";

/**
 * POST /api/mcp/install-manual
 * Instala um MCP a partir de uma configuração manual (formato Claude Desktop)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { config, mcpId, enableLogs } = body;

    // Validar estrutura básica
    if (!config || typeof config !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid configuration format" },
        { status: 400 }
      );
    }

    // Extrair primeiro servidor da configuração (se for formato mcpServers)
    let serverConfig: any;
    let serverId: string;

    if (config.mcpServers) {
      // Formato: { "mcpServers": { "server-name": { ... } } }
      const serverNames = Object.keys(config.mcpServers);
      if (serverNames.length === 0) {
        return NextResponse.json(
          { success: false, error: "No MCP server found in configuration" },
          { status: 400 }
        );
      }

      serverId = mcpId || serverNames[0];
      serverConfig = config.mcpServers[serverNames[0]];
    } else {
      // Formato direto: { "command": "...", "args": [...] }
      serverId = mcpId || "manual-mcp";
      serverConfig = config;
    }

    // Validar campos obrigatórios
    if (!serverConfig.command) {
      return NextResponse.json(
        { success: false, error: "Missing required field: command" },
        { status: 400 }
      );
    }

    console.log(`🚀 Starting manual installation for: ${serverId}`);
    console.log(
      `Command: ${serverConfig.command} ${(serverConfig.args || []).join(" ")}`
    );

    // Detectar tipo de pacote baseado no comando
    const { packageRegistry, packageName, repositoryUrl } =
      detectPackageInfo(serverConfig);

    console.log(`Detected package type: ${packageRegistry} (${packageName})`);

    // Verificar se já está instalado
    if (MCPRepository.isInstalled(serverId)) {
      const existing = MCPRepository.getInstalledMCP(serverId);

      if (existing.status === "ready") {
        return NextResponse.json(
          {
            success: false,
            error: `MCP ${serverId} is already installed`,
          },
          { status: 400 }
        );
      }

      console.log(
        `Re-installing MCP ${serverId} (current status: ${existing.status})`
      );
    }

    // Preparar configuração de instalação
    const installConfig: InstallationConfig = {
      mcpId: serverId,
      packageName,
      packageRegistry,
      repositoryUrl,
      config: serverConfig,
      enableLogs: enableLogs === true,
    };

    // Salvar no banco como PENDING
    if (!MCPRepository.isInstalled(serverId)) {
      MCPRepository.saveInstallation(serverId, serverConfig, []);
    }
    MCPRepository.updateInstallationStatus(
      serverId,
      "pending",
      "Starting manual installation..."
    );

    // Iniciar instalação em background
    installInBackground(installConfig);

    return NextResponse.json({
      success: true,
      message: "Manual installation started",
      mcpId: serverId,
      status: "pending",
      detectedType: packageRegistry,
    });
  } catch (error: any) {
    console.error("Error starting manual installation:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to start manual installation",
      },
      { status: 500 }
    );
  }
}

/**
 * Detecta informações do pacote baseado no comando
 */
function detectPackageInfo(serverConfig: any): {
  packageRegistry: PackageRegistry;
  packageName: string;
  repositoryUrl?: string;
} {
  const command = serverConfig.command.toLowerCase();
  const args = serverConfig.args || [];
  const firstArg = args[0] || "";

  // NPM/NPX
  if (command === "npx" || command === "npm") {
    // npx @mcpcentral/mcp-time
    // npx -y @modelcontextprotocol/server-filesystem
    const packageArg = args.find(
      (arg: string) => arg.startsWith("@") || !arg.startsWith("-")
    );
    const packageName = packageArg || firstArg || "unknown-npm-package";

    return {
      packageRegistry: "npm",
      packageName: packageName.replace(/^-y\s*/, "").trim(),
    };
  }

  // Node
  if (command === "node" || command.endsWith("node")) {
    // node dist/index.js -> assume que é local ou já instalado
    return {
      packageRegistry: "npm",
      packageName: "local-node-package",
    };
  }

  // Python
  if (
    command === "python" ||
    command === "python3" ||
    command.includes("python")
  ) {
    // python -m mcp_server_git
    // python /path/to/server.py
    const moduleIndex = args.indexOf("-m");
    if (moduleIndex !== -1 && args[moduleIndex + 1]) {
      return {
        packageRegistry: "pypi",
        packageName: args[moduleIndex + 1],
      };
    }

    return {
      packageRegistry: "pypi",
      packageName: "local-python-package",
    };
  }

  // UV (Python package manager)
  if (command === "uv" || command === "uvx") {
    // uvx mcp-server-git
    const packageName = args[0] || "unknown-uv-package";
    return {
      packageRegistry: "pypi",
      packageName,
    };
  }

  // Cargo/Rust
  if (command === "cargo") {
    // cargo run --bin mcp-server
    const binIndex = args.indexOf("--bin");
    if (binIndex !== -1 && args[binIndex + 1]) {
      return {
        packageRegistry: "cargo",
        packageName: args[binIndex + 1],
      };
    }

    return {
      packageRegistry: "cargo",
      packageName: "local-rust-package",
    };
  }

  // Docker
  if (command === "docker") {
    return {
      packageRegistry: "other",
      packageName: "docker-container",
    };
  }

  // Caminho absoluto ou relativo (executável local)
  if (command.startsWith("/") || command.startsWith("./")) {
    return {
      packageRegistry: "other",
      packageName: "local-executable",
    };
  }

  // Padrão: tratar como "other"
  return {
    packageRegistry: "other",
    packageName: command,
  };
}

/**
 * Executa instalação em background (não bloqueia resposta HTTP)
 */
async function installInBackground(config: InstallationConfig): Promise<void> {
  const { mcpId, enableLogs } = config;

  try {
    console.log(`📦 Installing ${mcpId} in background (manual mode)...`);

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
      status: MCPInstallationStatus.DOWNLOADING,
      message: "Preparing manual installation...",
      percentage: 5,
    });

    const environment = await MCPInstallerService.install(config, onProgress);

    // Salvar ambiente
    MCPRepository.saveEnvironment(mcpId, environment);

    onProgress({
      status: MCPInstallationStatus.TESTING,
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

      console.log(
        `✅ MCP ${mcpId} (manual) installed and validated successfully`
      );
    } else {
      // Validação falhou, mas instalação pode estar OK
      console.warn(
        `⚠️ MCP ${mcpId} (manual) installed but validation failed: ${validation.error}`
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
        console.log(
          `✅ MCP ${mcpId} (manual) installed (simple validation passed)`
        );
      } else {
        throw new Error(
          validation.error || simpleValidation.error || "Validation failed"
        );
      }
    }
  } catch (error: any) {
    console.error(`❌ Manual installation failed for ${mcpId}:`, error);

    MCPRepository.updateInstallationStatus(
      mcpId,
      "failed",
      error.message || "Manual installation failed"
    );

    if (enableLogs) {
      MCPRepository.appendLogs(mcpId, [
        `ERROR: ${error.message}`,
        error.stack || "",
      ]);
    }
  }
}
