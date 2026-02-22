// Types matching Rust backend structures

export interface SourceCategory {
  id: string;
  name: string;
  base_sites: string[];
  enabled: boolean;
}

export interface SourcesConfig {
  version: number;
  categories: SourceCategory[];
  last_updated: string;
}

export interface SearxngConfig {
  searxng_url: string;
  api_format: string;
  default_engines: string[];
  default_category: string;
  timeout_seconds: number;
  verify_ssl: boolean;
  enabled: boolean;
  log_search_content: boolean;
  anonymize_identifiers: boolean;
  encrypt_logs: boolean;
  retention_days: number;
  use_public_instances: boolean;
  search_via_scraping: boolean;
}

export interface SearchLog {
  id: string;
  chat_id?: string;
  user_id?: string;
  timestamp: string;
  searxng_instance?: string;
  query: string;
  engines?: string[];
  filters?: string;
  response_time_ms?: number;
  total_results?: number;
  results_per_engine?: string;
  error?: string;
}

