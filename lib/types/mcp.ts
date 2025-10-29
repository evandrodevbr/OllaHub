export interface MCPProvider {
  id: string; // formato: "owner/repo"
  originalId?: string; // ID original do cache antes de transformar para owner/repo
  owner?: string; // Owner do repositório
  repo?: string; // Nome do repositório
  name: string; // mapeado de content_name
  author: string; // mapeado de publisher_id
  description: string;
  version: string;
  category:
    | "map"
    | "browser"
    | "office"
    | "search"
    | "database"
    | "finance"
    | "code"
    | "chart"
    | "payment"
    | "other";
  tags: string[]; // mapeado de content_tag_list
  rating: number; // já existe na API
  totalRatings: number; // mapeado de review_cnt
  repository?: string; // mapeado de website
  homepage?: string;
  installed: boolean; // verificar localmente
  // Novos campos da API DeepNLP
  subfield?: string; // MAP, BROWSER, etc
  field?: string; // sempre "MCP SERVER"
  config?: any[]; // configuração JSON do servidor
  tools?: MCPTool[]; // schemas das ferramentas
}

export interface MCPCategory {
  id: string;
  name: string;
  icon: string;
  count: number;
}

export interface MCPInstallationStatus {
  success: boolean;
  message: string;
  mcpId: string;
}

export interface MCPTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

// Tipos relacionados a busca/marketplace foram removidos

export interface MCPTestResult {
  success: boolean;
  message: string;
  responseTime?: number; // em ms
  serverVersion?: string;
  availableTools?: number;
  error?: string;
}

export interface MCPTestRequest {
  mcpId: string;
}

// Metadados específicos de PulseMCP removidos
