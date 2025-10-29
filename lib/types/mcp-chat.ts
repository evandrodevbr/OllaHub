/**
 * Tipos e interfaces para integração de MCPs no chat
 */

/**
 * Representa um tool MCP com schema JSON
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Contexto de MCPs ativos para a conversa
 */
export interface MCPChatContext {
  mcpId: string;
  enabled: boolean;
  tools: MCPTool[];
  config: any;
}

/**
 * Resultado da execução de um MCP
 */
export interface MCPExecutionResult {
  success: boolean;
  toolName: string;
  mcpId: string;
  result?: any;
  error?: string;
  executionTime?: number;
}

/**
 * Capabilities de function calling do modelo
 */
export interface ModelCapabilities {
  supportsNativeTools: boolean;
  requiresPromptEngineering: boolean;
  modelName: string;
  toolCallFormat?: "openai" | "anthropic" | "custom";
}

/**
 * Configuração de MCPs para chat
 */
export interface MCPChatConfig {
  alwaysActive: string[]; // MCPs sempre ativos
  neverUse: string[]; // MCPs nunca usar
  activationMode: "automatic" | "keywords" | "manual";
}

/**
 * Intent detectado na mensagem do usuário
 */
export interface DetectedIntent {
  type:
    | "web_search"
    | "time"
    | "weather"
    | "file"
    | "code"
    | "database"
    | "other";
  confidence: number;
  keywords: string[];
  suggestedTools: string[];
}
