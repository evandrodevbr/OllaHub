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

