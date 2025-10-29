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

export interface DeepNLPSearchParams {
  query?: string;
  category?: string;
  id?: string;
  page_id?: number;
  count_per_page?: number;
  offset?: number;
  mode?: "list" | "dict";
}

export interface DeepNLPResponse {
  query?: string;
  items: any[];
  count: number;
  total_hits: number;
}

export interface MCPServerConfig {
  total_hits: number;
  id: string;
  items: any[];
}

export interface MCPSearchParams {
  category?: string;
  search?: string;
  sort?: "rating" | "name" | "recent" | "total_ratings" | "updated_at";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

// PulseMCP API Types
export interface PulseMCPSearchParams {
  query?: string;
  integrations?: string[];
  count_per_page?: number;
  offset?: number;
}

export interface PulseMCPResponse {
  servers: MCPServerMetadata[];
  next?: string;
  total_count: number;
}

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

export interface MCPServerMetadata {
  name: string;
  url: string;
  external_url?: string;
  short_description: string;
  source_code_url: string;
  github_stars?: number;
  package_registry: "npm" | "pypi" | "cargo";
  package_name: string;
  package_download_count?: number;
  EXPERIMENTAL_ai_generated_description?: string;
  _meta: {
    "com.pulsemcp": {
      estimated_downloads_all_time: number;
      estimated_downloads_last_30_days: number;
      estimated_downloads_last_7_days: number;
      standardized_name: string;
      standardized_description: string;
      standardized_provider_name: string;
      standardized_provider_url: string;
      estimated_released_on: string;
      is_official: boolean;
    };
  };
}
