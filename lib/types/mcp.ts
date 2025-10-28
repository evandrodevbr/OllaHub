export interface MCPProvider {
  id: string; // formato: "owner/repo"
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
  downloads: number; // opcional, calcular baseado em reviews
  iconUrl?: string; // mapeado de thumbnail_picture
  screenshotUrls?: string[];
  capabilities: string[]; // mapeado de ext_info.tools
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
  sort?:
    | "rating"
    | "downloads"
    | "name"
    | "recent"
    | "total_ratings"
    | "updated_at";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}
