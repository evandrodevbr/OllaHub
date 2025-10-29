/**
 * Serviço de validação de protocolo MCP (JSON-RPC)
 */

import { spawn } from "child_process";
import type {
  MCPEnvironment,
  ValidationResult,
} from "@/lib/types/mcp-installer";
import { MCP_CONFIG } from "@/lib/config/mcp";

export class MCPValidatorService {
  /**
   * Valida se um servidor MCP está funcionando corretamente
   * Testa o protocolo JSON-RPC do MCP
   */
  static async validateMCPServer(
    environment: MCPEnvironment,
    config: any,
    timeoutMs: number = MCP_CONFIG.testTimeout
  ): Promise<ValidationResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let hasResolved = false;

      // Preparar comando e argumentos
      const command = environment.executable;
      const args = environment.args || [];
      const env = {
        ...process.env,
        ...environment.env,
        ...(config.env || {}),
      };

      // Para NPM, adicionar node_modules/.bin ao PATH para encontrar binários locais
      if (environment.type === "npm" && environment.path) {
        const nodeBinPath = `${environment.path}/node_modules/.bin`;
        env.PATH = `${nodeBinPath}:${env.PATH || process.env.PATH}`;
      }

      console.log(`🧪 Testing MCP server: ${command} ${args.join(" ")}`);

      try {
        // Spawnar processo do servidor MCP
        const serverProcess = spawn(command, args, {
          cwd: environment.path, // Executar do diretório de instalação
          env,
          stdio: ["pipe", "pipe", "pipe"],
          shell: process.platform === "win32", // Workaround para *.cmd no Windows
        });

        let stdout = "";
        let stderr = "";
        const responses: any[] = [];
        let currentBuffer = "";

        // Timeout
        const timeoutId = setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            serverProcess.kill();
            resolve({
              success: false,
              protocol: "unknown",
              tools: [],
              error: `Timeout after ${timeoutMs}ms. Server did not respond.`,
            });
          }
        }, timeoutMs);

        // Capturar stdout (respostas JSON-RPC)
        serverProcess.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          stdout += text;
          currentBuffer += text;

          // Processar respostas JSON-RPC linha por linha
          const lines = currentBuffer.split("\n");
          currentBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("{")) {
              try {
                const response = JSON.parse(trimmed);
                responses.push(response);
                console.log(
                  "📨 MCP Response:",
                  JSON.stringify(response).substring(0, 200)
                );

                // Verificar se recebemos resposta válida de initialize
                if (
                  response.id === 1 &&
                  response.result &&
                  response.result.capabilities
                ) {
                  // Protocolo MCP detectado, agora listar ferramentas
                  this.sendRequest(serverProcess, {
                    jsonrpc: "2.0",
                    method: "tools/list",
                    id: 2,
                  });
                }

                // Verificar se recebemos lista de ferramentas
                if (response.id === 2 && response.result) {
                  clearTimeout(timeoutId);
                  if (!hasResolved) {
                    hasResolved = true;
                    serverProcess.kill();

                    const tools = Array.isArray(response.result.tools)
                      ? response.result.tools.map((tool: any) => ({
                          name: tool.name || "unnamed",
                          description: tool.description,
                          inputSchema: tool.inputSchema,
                        }))
                      : [];

                    resolve({
                      success: true,
                      protocol: "mcp",
                      tools,
                      capabilities: responses[0]?.result?.capabilities,
                    });
                  }
                }
              } catch (e) {
                // Não é JSON válido, ignorar
              }
            }
          }
        });

        // Capturar stderr
        serverProcess.stderr?.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        // Error handler
        serverProcess.on("error", (error) => {
          clearTimeout(timeoutId);
          if (!hasResolved) {
            hasResolved = true;
            resolve({
              success: false,
              protocol: "unknown",
              tools: [],
              error: `Failed to spawn server: ${error.message}`,
            });
          }
        });

        // Exit handler
        serverProcess.on("exit", (code) => {
          clearTimeout(timeoutId);
          if (!hasResolved) {
            hasResolved = true;

            // Se saiu muito rápido sem responder, é um erro
            const elapsed = Date.now() - startTime;
            if (elapsed < 1000) {
              resolve({
                success: false,
                protocol: "unknown",
                tools: [],
                error: `Server exited quickly with code ${code}. stderr: ${stderr}`,
              });
            } else {
              // Servidor pode ter processado e saído normalmente
              resolve({
                success: false,
                protocol: "unknown",
                tools: [],
                error: `Server exited with code ${code} before completing validation`,
              });
            }
          }
        });

        // Aguardar servidor estar pronto (pequeno delay)
        setTimeout(() => {
          if (!hasResolved) {
            // Enviar requisição de initialize
            this.sendRequest(serverProcess, {
              jsonrpc: "2.0",
              method: "initialize",
              params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: {
                  name: "ollahub",
                  version: "1.0.0",
                },
              },
              id: 1,
            });
          }
        }, 500);
      } catch (error: any) {
        resolve({
          success: false,
          protocol: "unknown",
          tools: [],
          error: `Validation error: ${error.message}`,
        });
      }
    });
  }

  /**
   * Envia requisição JSON-RPC para o servidor
   */
  private static sendRequest(process: any, request: any): void {
    try {
      const requestStr = JSON.stringify(request) + "\n";
      console.log("📤 Sending MCP request:", requestStr.trim());
      process.stdin?.write(requestStr);
    } catch (error: any) {
      console.error("Failed to send request:", error.message);
    }
  }

  /**
   * Validação simples de servidor (apenas verifica se inicia)
   * Usado como fallback se validação JSON-RPC falhar
   */
  static async simpleValidation(
    environment: MCPEnvironment,
    config: any,
    timeoutMs: number = 5000
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const command = environment.executable;
      const args = environment.args || [];
      const env = {
        ...process.env,
        ...environment.env,
        ...(config.env || {}),
      };

      // Para NPM, adicionar node_modules/.bin ao PATH para encontrar binários locais
      if (environment.type === "npm" && environment.path) {
        const nodeBinPath = `${environment.path}/node_modules/.bin`;
        env.PATH = `${nodeBinPath}:${env.PATH || process.env.PATH}`;
      }

      try {
        const serverProcess = spawn(command, args, {
          cwd: environment.path, // Executar do diretório de instalação
          env,
          stdio: ["pipe", "pipe", "pipe"],
          shell: process.platform === "win32",
        });

        let hasResolved = false;

        const timeoutId = setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            serverProcess.kill();
            // Se chegou ao timeout sem errar, provavelmente está rodando
            resolve({ success: true });
          }
        }, timeoutMs);

        serverProcess.on("error", (error) => {
          clearTimeout(timeoutId);
          if (!hasResolved) {
            hasResolved = true;
            resolve({
              success: false,
              error: `Failed to start: ${error.message}`,
            });
          }
        });

        serverProcess.on("exit", (code) => {
          clearTimeout(timeoutId);
          if (!hasResolved) {
            hasResolved = true;
            if (code === 0) {
              resolve({ success: true });
            } else {
              resolve({
                success: false,
                error: `Exited with code ${code}`,
              });
            }
          }
        });
      } catch (error: any) {
        resolve({
          success: false,
          error: `Validation error: ${error.message}`,
        });
      }
    });
  }
}
