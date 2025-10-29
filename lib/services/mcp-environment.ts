/**
 * Serviço de gerenciamento de ambientes isolados para servidores MCP
 */

import { mkdir, rm, access } from "fs/promises";
import path from "path";
import { MCP_CONFIG } from "@/lib/config/mcp";
import { commandExists, spawnWithProgress } from "@/lib/utils/system";
import type {
  MCPEnvironment,
  SystemDependencies,
} from "@/lib/types/mcp-installer";

export class MCPEnvironmentService {
  /**
   * Verifica dependências do sistema
   */
  static async checkSystemDependencies(): Promise<SystemDependencies> {
    const [node, npm, python, pip, cargo, git] = await Promise.all([
      commandExists("node"),
      commandExists("npm"),
      commandExists("python3"),
      commandExists("pip3"),
      commandExists("cargo"),
      commandExists("git"),
    ]);

    return { node, npm, python, pip, cargo, git };
  }

  /**
   * Garante que o diretório de ambiente existe
   */
  static async ensureEnvironmentDirectory(
    type: "npm" | "python" | "rust"
  ): Promise<string> {
    let dir: string;

    switch (type) {
      case "npm":
        dir = MCP_CONFIG.npmDir;
        break;
      case "python":
        dir = MCP_CONFIG.pythonDir;
        break;
      case "rust":
        dir = MCP_CONFIG.rustDir;
        break;
    }

    try {
      await mkdir(dir, { recursive: true });
      console.log(`✓ Environment directory ensured: ${dir}`);
      return dir;
    } catch (error: any) {
      throw new Error(
        `Failed to create environment directory: ${error.message}`
      );
    }
  }

  /**
   * Cria ambiente virtual Python para um MCP específico
   */
  static async createPythonVenv(
    mcpId: string,
    onProgress?: (message: string) => void
  ): Promise<string> {
    const venvPath = path.join(MCP_CONFIG.pythonDir, mcpId);

    // Verificar se já existe
    try {
      await access(venvPath);
      onProgress?.(`Virtual environment already exists at ${venvPath}`);
      return venvPath;
    } catch {
      // Não existe, criar novo
    }

    onProgress?.("Creating Python virtual environment...");

    try {
      const result = await spawnWithProgress(
        "python3",
        ["-m", "venv", venvPath],
        {
          onOutput: (data) => onProgress?.(data.trim()),
          timeout: 60000, // 1 minuto para criar venv
        }
      );

      if (result.exitCode !== 0) {
        throw new Error(
          `Failed to create venv: ${result.stderr || result.stdout}`
        );
      }

      onProgress?.(`✓ Virtual environment created at ${venvPath}`);
      return venvPath;
    } catch (error: any) {
      throw new Error(`Failed to create Python venv: ${error.message}`);
    }
  }

  /**
   * Obtém caminho do executável para um ambiente
   */
  static getExecutablePath(
    type: "npm" | "python" | "rust",
    mcpId: string,
    packageName?: string
  ): { executable: string; args: string[] } {
    switch (type) {
      case "npm":
        // Para npm, usar npx para executar pacotes instalados localmente
        return {
          executable: "npx",
          args: packageName ? ["--prefix", MCP_CONFIG.npmDir, packageName] : [],
        };

      case "python": {
        const venvPath = path.join(MCP_CONFIG.pythonDir, mcpId);
        const pythonBin =
          process.platform === "win32"
            ? path.join(venvPath, "Scripts", "python.exe")
            : path.join(venvPath, "bin", "python");

        return {
          executable: pythonBin,
          args: packageName ? ["-m", packageName] : [],
        };
      }

      case "rust": {
        // Para Rust, o binário estará em target/release/
        const binaryPath = path.join(
          MCP_CONFIG.rustDir,
          mcpId,
          "target",
          "release",
          packageName || mcpId
        );

        return {
          executable: binaryPath,
          args: [],
        };
      }
    }
  }

  /**
   * Limpa ambiente de um MCP (desinstalação)
   */
  static async cleanupEnvironment(environment: MCPEnvironment): Promise<void> {
    try {
      console.log(`Cleaning up environment at ${environment.path}`);

      await rm(environment.path, { recursive: true, force: true });

      console.log(`✓ Environment cleaned: ${environment.path}`);
    } catch (error: any) {
      console.error(`Warning: Failed to cleanup environment: ${error.message}`);
      // Não lançar erro - cleanup é best-effort
    }
  }

  /**
   * Verifica se um ambiente está válido
   */
  static async validateEnvironment(
    environment: MCPEnvironment
  ): Promise<boolean> {
    try {
      // Verificar se o diretório existe
      await access(environment.path);

      // Verificar se o executável existe
      await access(environment.executable);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtém informações sobre o ambiente de um MCP
   */
  static async getEnvironmentInfo(
    mcpId: string,
    type: "npm" | "python" | "rust"
  ): Promise<{
    exists: boolean;
    path: string;
    size?: number;
  }> {
    const envPath = path.join(
      type === "npm"
        ? MCP_CONFIG.npmDir
        : type === "python"
        ? path.join(MCP_CONFIG.pythonDir, mcpId)
        : path.join(MCP_CONFIG.rustDir, mcpId)
    );

    try {
      await access(envPath);
      // TODO: Calcular tamanho do diretório se necessário
      return { exists: true, path: envPath };
    } catch {
      return { exists: false, path: envPath };
    }
  }
}
