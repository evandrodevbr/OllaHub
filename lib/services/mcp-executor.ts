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
      if (mcpData.status !== "ready") {
        throw new Error(
          `MCP ${mcpId} is not ready (status: ${mcpData.status})`
        );
      }

      // Obter comando executável
      const config = JSON.parse(mcpData.config);
      const command = config.command || mcpData.executable_command;
      const args = config.args || [];

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
        ...process.env,
        ...(environmentPath && {
          PATH: `${environmentPath}/node_modules/.bin:${process.env.PATH}`,
        }),
      };

      const process = spawn(command, args, {
        cwd: environmentPath || process.cwd(),
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let responseReceived = false;

      // Timeout
      const timeout = setTimeout(() => {
        if (!responseReceived) {
          process.kill();
          reject(new Error(`Execution timeout after ${EXECUTION_TIMEOUT}ms`));
        }
      }, EXECUTION_TIMEOUT);

      // Capturar stdout
      process.stdout?.on("data", (data) => {
        stdout += data.toString();

        // Tentar parsear respostas JSON-RPC
        const lines = stdout.split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.id === 2 && parsed.result) {
                // Resposta do tools/call
                clearTimeout(timeout);
                responseReceived = true;
                process.kill();
                resolve(parsed.result);
              }
            } catch (e) {
              // Linha não é JSON válido, continuar
            }
          }
        }
      });

      // Capturar stderr
      process.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      // Erro de processo
      process.on("error", (error) => {
        clearTimeout(timeout);
        reject(new Error(`Process error: ${error.message}`));
      });

      // Processo encerrou
      process.on("close", (code) => {
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
        process.stdin?.write(JSON.stringify(initRequest) + "\n");

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
          process.stdin?.write(JSON.stringify(toolCallRequest) + "\n");
          process.stdin?.end();
        }, 500);
      } catch (error: any) {
        clearTimeout(timeout);
        process.kill();
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
