/**
 * Serviço executor de MCPs - spawna processos e executa tools via JSON-RPC
 */

import { spawn, type ChildProcess } from "child_process";
import { MCPRepository } from "@/database/repositories/mcp";
import type { MCPExecutionResult, MCPTool } from "@/lib/types/mcp-chat";

const EXECUTION_TIMEOUT = 30000; // 30 segundos

export class MCPExecutor {
  /**
   * Executa um tool de MCP
   * @param mcpId ID do MCP instalado
   * @param toolName Nome do tool a executar
   * @param parameters Parâmetros do tool
   * @returns Resultado da execução
   */
  static async executeMCPTool(
    mcpId: string,
    toolName: string,
    parameters: Record<string, any>
  ): Promise<MCPExecutionResult> {
    const startTime = Date.now();

    try {
      // Obter dados do MCP instalado
      const mcpData = MCPRepository.getInstalledMCP(mcpId);
      if (!mcpData) {
        throw new Error(`MCP ${mcpId} not found or not installed`);
      }

      // Verificar se está pronto
      // Se status é undefined/null, considerar como "ready" (MCPs instalados antes da implementação de status)
      if (mcpData.status && mcpData.status !== "ready") {
        throw new Error(
          `MCP ${mcpId} is not ready (status: ${mcpData.status})`
        );
      }

      // Obter comando executável
      // mcpData.config já vem parseado do repositório, mas pode ser string em casos legados
      const config =
        typeof mcpData.config === "string"
          ? JSON.parse(mcpData.config)
          : mcpData.config || {};
      const commandFromConfig = config.command;
      const argsFromConfig = Array.isArray(config.args) ? config.args : [];

      let command = commandFromConfig;
      let args = argsFromConfig;

      // Se não houver command em config, reconstruir a partir de executable_command (se existir)
      if (!command && mcpData.executable_command) {
        const parts = String(mcpData.executable_command).trim().split(/\s+/);
        command = parts[0];
        args = parts.slice(1);
      }

      if (!command) {
        throw new Error(`No executable command found for MCP ${mcpId}`);
      }

      console.log(`🚀 Executing MCP tool: ${mcpId}.${toolName}`);
      console.log(`Command: ${command} ${args.join(" ")}`);

      // Spawnar processo do MCP
      const result = await this.spawnMCPProcess(
        command,
        args,
        toolName,
        parameters,
        mcpData.environment_path
      );

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        toolName,
        mcpId,
        result,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      console.error(`❌ Error executing MCP tool ${mcpId}.${toolName}:`, error);

      return {
        success: false,
        toolName,
        mcpId,
        error: error.message || "Unknown error",
        executionTime,
      };
    }
  }

  /**
   * Spawna processo do MCP e executa JSON-RPC
   * @param command Comando executável
   * @param args Argumentos do comando
   * @param toolName Nome do tool
   * @param parameters Parâmetros do tool
   * @param environmentPath Caminho do ambiente (opcional)
   * @returns Resultado do tool
   */
  private static async spawnMCPProcess(
    command: string,
    args: string[],
    toolName: string,
    parameters: Record<string, any>,
    environmentPath?: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const env = {
        ...globalThis.process.env,
        ...(environmentPath && {
          PATH: `${environmentPath}/node_modules/.bin:${globalThis.process.env.PATH}`,
        }),
      };

      const childProcess = spawn(command, args, {
        cwd: environmentPath || globalThis.process.cwd(),
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let responseReceived = false;

      // Timeout
      const timeout = setTimeout(() => {
        if (!responseReceived) {
          childProcess.kill();
          reject(new Error(`Execution timeout after ${EXECUTION_TIMEOUT}ms`));
        }
      }, EXECUTION_TIMEOUT);

      // Capturar stdout
      childProcess.stdout?.on("data", (data) => {
        stdout += data.toString();
        // Loga por linhas para diagnóstico
        const printedLines = data
          .toString()
          .split("\n")
          .filter((l: string) => l.trim().length > 0);
        for (const l of printedLines) {
          console.log(`📥 [MCP stdout] ${l}`);
        }

        // Tentar parsear respostas JSON-RPC
        const parsedLines = stdout.split("\n");
        for (const line of parsedLines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              console.log("🔎 [MCP stdout parsed]", parsed);
              if (parsed.id === 2 && parsed.result) {
                // Resposta do tools/call
                clearTimeout(timeout);
                responseReceived = true;
                childProcess.kill();
                resolve(parsed.result);
              }
            } catch (e) {
              // Linha não é JSON válido, continuar
            }
          }
        }
      });

      // Capturar stderr
      childProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
        const errLines = data
          .toString()
          .split("\n")
          .filter((l: string) => l.trim().length > 0);
        for (const l of errLines) {
          console.warn(`⚠️  [MCP stderr] ${l}`);
        }
      });

      // Erro de processo
      childProcess.on("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`Process error: ${error.message}`));
      });

      // Processo encerrou
      childProcess.on("close", (code) => {
        clearTimeout(timeout);
        if (!responseReceived) {
          if (code !== 0) {
            reject(
              new Error(`Process exited with code ${code}. stderr: ${stderr}`)
            );
          } else {
            reject(new Error("No valid response received from MCP"));
          }
        }
      });

      // Enviar requisições JSON-RPC
      try {
        // 1. Initialize
        const initRequest = {
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "ollahub", version: "1.0.0" },
          },
          id: 1,
        };
        console.log("📤 [MCP send] initialize", initRequest);
        childProcess.stdin?.write(JSON.stringify(initRequest) + "\n");

        // Aguardar um pouco antes de enviar tool call
        setTimeout(() => {
          // 2. Call tool
          const toolCallRequest = {
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
              name: toolName,
              arguments: parameters,
            },
            id: 2,
          };
          console.log("📤 [MCP send] tools/call", toolCallRequest);
          childProcess.stdin?.write(JSON.stringify(toolCallRequest) + "\n");
          childProcess.stdin?.end();
        }, 500);
      } catch (error: any) {
        clearTimeout(timeout);
        childProcess.kill();
        reject(new Error(`Failed to send JSON-RPC request: ${error.message}`));
      }
    });
  }

  /**
   * Obter tools disponíveis de um MCP
   * @param mcpId ID do MCP
   * @returns Array de tools
   */
  static getAvailableTools(mcpId: string): MCPTool[] {
    try {
      const mcpData = MCPRepository.getInstalledMCP(mcpId);
      if (!mcpData || !mcpData.tools) {
        return [];
      }

      // Se já é um array (já foi parseado), retornar diretamente
      if (Array.isArray(mcpData.tools)) {
        return mcpData.tools;
      }

      // Se é string, parsear
      if (typeof mcpData.tools === "string") {
        const tools = JSON.parse(mcpData.tools);
        return Array.isArray(tools) ? tools : [];
      }

      return [];
    } catch (error) {
      console.error(`Error getting available tools for ${mcpId}:`, error);
      return [];
    }
  }

  /**
   * Validar parâmetros contra schema do tool
   * @param parameters Parâmetros fornecidos
   * @param tool Definição do tool
   * @returns true se válido, false caso contrário
   */
  static validateParameters(
    parameters: Record<string, any>,
    tool: MCPTool
  ): { valid: boolean; error?: string } {
    try {
      const schema = tool.inputSchema;

      // Verificar campos obrigatórios
      if (schema.required) {
        for (const required of schema.required) {
          if (!(required in parameters)) {
            return {
              valid: false,
              error: `Missing required parameter: ${required}`,
            };
          }
        }
      }

      // Validação básica de tipos
      for (const [key, value] of Object.entries(parameters)) {
        if (schema.properties && schema.properties[key]) {
          const propSchema = schema.properties[key];
          const expectedType = propSchema.type;

          if (expectedType) {
            const actualType = typeof value;
            // Tratar objeto vazio como "ausente" quando tipo esperado não é object
            if (
              value &&
              actualType === "object" &&
              !Array.isArray(value) &&
              Object.keys(value).length === 0 &&
              expectedType !== "object"
            ) {
              continue;
            }
            const valid =
              (expectedType === "string" && actualType === "string") ||
              (expectedType === "number" && actualType === "number") ||
              (expectedType === "boolean" && actualType === "boolean") ||
              (expectedType === "object" && actualType === "object") ||
              (expectedType === "array" && Array.isArray(value));

            if (!valid) {
              return {
                valid: false,
                error: `Parameter ${key} should be ${expectedType}, got ${actualType}`,
              };
            }
          }
        }
      }

      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }
}
