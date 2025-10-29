/**
 * Serviço de instalação de servidores MCP
 */

import path from "path";
import { MCP_CONFIG } from "@/lib/config/mcp";
import { MCPEnvironmentService } from "./mcp-environment";
import { sanitizePackageName, spawnWithProgress } from "@/lib/utils/system";
import type {
  MCPEnvironment,
  InstallationProgress,
  MCPInstallationStatus,
  InstallationConfig,
} from "@/lib/types/mcp-installer";

export class MCPInstallerService {
  /**
   * Instala um servidor MCP baseado na configuração
   */
  static async install(
    config: InstallationConfig,
    onProgress: (progress: InstallationProgress) => void
  ): Promise<MCPEnvironment> {
    // Verificar dependências do sistema
    onProgress({
      status: "checking_dependencies" as MCPInstallationStatus,
      message: "Checking system dependencies...",
      percentage: 5,
    });

    const dependencies = await MCPEnvironmentService.checkSystemDependencies();

    // Determinar tipo de instalação
    const installType = this.determineInstallType(config, dependencies);

    onProgress({
      status: "downloading" as MCPInstallationStatus,
      message: `Preparing ${installType} installation...`,
      percentage: 10,
    });

    // Delegar para instalador específico
    switch (installType) {
      case "npm":
        return await this.installNPM(config, onProgress, dependencies);
      case "python":
        return await this.installPython(config, onProgress, dependencies);
      case "rust":
        return await this.installRust(config, onProgress, dependencies);
      default:
        throw new Error(`Unsupported installation type: ${installType}`);
    }
  }

  /**
   * Determina o tipo de instalação baseado na configuração
   */
  private static determineInstallType(
    config: InstallationConfig,
    dependencies: any
  ): "npm" | "python" | "rust" {
    // Preferir package_registry se disponível
    if (config.packageRegistry === "npm" && dependencies.npm) {
      return "npm";
    }
    if (config.packageRegistry === "pypi" && dependencies.python) {
      return "python";
    }
    if (config.packageRegistry === "cargo" && dependencies.cargo) {
      return "rust";
    }

    // Tentar detectar pelo nome do pacote
    if (config.packageName) {
      if (
        config.packageName.startsWith("@") ||
        config.packageName.includes("/")
      ) {
        if (dependencies.npm) return "npm";
      }
      if (
        config.packageName.includes("mcp-server") ||
        config.packageName.includes("mcp_server")
      ) {
        if (dependencies.python) return "python";
      }
    }

    // Fallback para npm se disponível
    if (dependencies.npm) return "npm";
    if (dependencies.python) return "python";
    if (dependencies.cargo) return "rust";

    throw new Error("No suitable package manager found");
  }

  /**
   * Instala pacote NPM
   */
  private static async installNPM(
    config: InstallationConfig,
    onProgress: (progress: InstallationProgress) => void,
    dependencies: any
  ): Promise<MCPEnvironment> {
    if (!dependencies.npm) {
      throw new Error("npm is not installed on this system");
    }

    // Sanitizar nome do pacote
    const packageName = sanitizePackageName(config.packageName);

    onProgress({
      status: "installing" as MCPInstallationStatus,
      message: `Installing npm package: ${packageName}`,
      percentage: 20,
      logs: config.enableLogs
        ? [`Installing ${packageName} via npm...`]
        : undefined,
    });

    // Garantir diretório npm existe
    const npmDir = await MCPEnvironmentService.ensureEnvironmentDirectory(
      "npm"
    );

    // Instalar pacote localmente no diretório npm
    const logs: string[] = [];

    try {
      const result = await spawnWithProgress(
        "npm",
        ["install", packageName, "--prefix", npmDir],
        {
          cwd: npmDir,
          timeout: MCP_CONFIG.installTimeout,
          onOutput: (data, isError) => {
            if (config.enableLogs) {
              logs.push(data);
            }

            // Atualizar progresso baseado na saída
            let percentage = 40;
            if (data.includes("fetchMetadata")) percentage = 30;
            if (data.includes("extract")) percentage = 50;
            if (data.includes("finalize")) percentage = 70;

            onProgress({
              status: "installing" as MCPInstallationStatus,
              message: isError
                ? `npm: ${data.substring(0, 100)}`
                : `Installing: ${data.substring(0, 100)}`,
              percentage,
              logs: config.enableLogs ? [data] : undefined,
            });
          },
        }
      );

      if (result.exitCode !== 0) {
        throw new Error(
          `npm install failed: ${result.stderr || result.stdout}`
        );
      }

      onProgress({
        status: "installing" as MCPInstallationStatus,
        message: "npm package installed successfully",
        percentage: 80,
        logs: config.enableLogs ? ["✓ Installation completed"] : undefined,
      });

      // Construir ambiente
      const environment: MCPEnvironment = {
        type: "npm",
        path: npmDir,
        executable: "npx",
        args: ["--prefix", npmDir, packageName],
      };

      return environment;
    } catch (error: any) {
      throw new Error(`NPM installation failed: ${error.message}`);
    }
  }

  /**
   * Instala pacote Python
   */
  private static async installPython(
    config: InstallationConfig,
    onProgress: (progress: InstallationProgress) => void,
    dependencies: any
  ): Promise<MCPEnvironment> {
    if (!dependencies.python || !dependencies.pip) {
      throw new Error("Python3 and pip3 are not installed on this system");
    }

    const packageName = sanitizePackageName(config.packageName);

    onProgress({
      status: "installing" as MCPInstallationStatus,
      message: "Creating Python virtual environment...",
      percentage: 20,
      logs: config.enableLogs ? ["Creating venv..."] : undefined,
    });

    // Garantir diretório python existe
    await MCPEnvironmentService.ensureEnvironmentDirectory("python");

    // Criar venv para este MCP
    const venvPath = await MCPEnvironmentService.createPythonVenv(
      config.mcpId,
      (msg) => {
        if (config.enableLogs) {
          onProgress({
            status: "installing" as MCPInstallationStatus,
            message: msg,
            percentage: 30,
            logs: [msg],
          });
        }
      }
    );

    onProgress({
      status: "installing" as MCPInstallationStatus,
      message: `Installing Python package: ${packageName}`,
      percentage: 40,
      logs: config.enableLogs
        ? [`Installing ${packageName} via pip...`]
        : undefined,
    });

    // Caminho para pip no venv
    const pipBin =
      process.platform === "win32"
        ? path.join(venvPath, "Scripts", "pip.exe")
        : path.join(venvPath, "bin", "pip");

    const pythonBin =
      process.platform === "win32"
        ? path.join(venvPath, "Scripts", "python.exe")
        : path.join(venvPath, "bin", "python");

    try {
      const result = await spawnWithProgress(pipBin, ["install", packageName], {
        cwd: venvPath,
        timeout: MCP_CONFIG.installTimeout,
        onOutput: (data, isError) => {
          if (config.enableLogs) {
            onProgress({
              status: "installing" as MCPInstallationStatus,
              message: `pip: ${data.substring(0, 100)}`,
              percentage: 60,
              logs: [data],
            });
          }
        },
      });

      if (result.exitCode !== 0) {
        throw new Error(
          `pip install failed: ${result.stderr || result.stdout}`
        );
      }

      onProgress({
        status: "installing" as MCPInstallationStatus,
        message: "Python package installed successfully",
        percentage: 80,
        logs: config.enableLogs ? ["✓ Installation completed"] : undefined,
      });

      // Extrair módulo Python do nome do pacote (ex: mcp-server-git -> mcp_server_git)
      const moduleName = packageName.replace(/-/g, "_");

      const environment: MCPEnvironment = {
        type: "python",
        path: venvPath,
        executable: pythonBin,
        args: ["-m", moduleName],
      };

      return environment;
    } catch (error: any) {
      throw new Error(`Python installation failed: ${error.message}`);
    }
  }

  /**
   * Instala servidor Rust (via git clone + cargo build)
   */
  private static async installRust(
    config: InstallationConfig,
    onProgress: (progress: InstallationProgress) => void,
    dependencies: any
  ): Promise<MCPEnvironment> {
    if (!dependencies.cargo || !dependencies.git) {
      throw new Error("Cargo and Git are not installed on this system");
    }

    if (!config.repositoryUrl) {
      throw new Error("Repository URL is required for Rust installation");
    }

    onProgress({
      status: "downloading" as MCPInstallationStatus,
      message: "Cloning Rust repository...",
      percentage: 20,
      logs: config.enableLogs
        ? [`Cloning ${config.repositoryUrl}...`]
        : undefined,
    });

    // Garantir diretório rust existe
    await MCPEnvironmentService.ensureEnvironmentDirectory("rust");

    const projectPath = path.join(MCP_CONFIG.rustDir, config.mcpId);

    try {
      // Clonar repositório
      const cloneResult = await spawnWithProgress(
        "git",
        ["clone", config.repositoryUrl, projectPath],
        {
          cwd: MCP_CONFIG.rustDir,
          timeout: MCP_CONFIG.installTimeout,
          onOutput: (data) => {
            if (config.enableLogs) {
              onProgress({
                status: "downloading" as MCPInstallationStatus,
                message: `git: ${data.substring(0, 100)}`,
                percentage: 30,
                logs: [data],
              });
            }
          },
        }
      );

      if (cloneResult.exitCode !== 0) {
        throw new Error(`git clone failed: ${cloneResult.stderr}`);
      }

      onProgress({
        status: "installing" as MCPInstallationStatus,
        message: "Building Rust project...",
        percentage: 40,
        logs: config.enableLogs ? ["Building with cargo..."] : undefined,
      });

      // Compilar com cargo
      const buildResult = await spawnWithProgress(
        "cargo",
        ["build", "--release"],
        {
          cwd: projectPath,
          timeout: MCP_CONFIG.installTimeout,
          onOutput: (data, isError) => {
            if (config.enableLogs) {
              let percentage = 50;
              if (data.includes("Compiling")) percentage = 60;
              if (data.includes("Finished")) percentage = 80;

              onProgress({
                status: "installing" as MCPInstallationStatus,
                message: `cargo: ${data.substring(0, 100)}`,
                percentage,
                logs: [data],
              });
            }
          },
        }
      );

      if (buildResult.exitCode !== 0) {
        throw new Error(`cargo build failed: ${buildResult.stderr}`);
      }

      onProgress({
        status: "installing" as MCPInstallationStatus,
        message: "Rust project built successfully",
        percentage: 80,
        logs: config.enableLogs ? ["✓ Build completed"] : undefined,
      });

      // Determinar nome do binário
      const binaryName = config.packageName || config.mcpId;
      const binaryPath = path.join(
        projectPath,
        "target",
        "release",
        process.platform === "win32" ? `${binaryName}.exe` : binaryName
      );

      const environment: MCPEnvironment = {
        type: "rust",
        path: projectPath,
        executable: binaryPath,
        args: [],
      };

      return environment;
    } catch (error: any) {
      throw new Error(`Rust installation failed: ${error.message}`);
    }
  }
}
