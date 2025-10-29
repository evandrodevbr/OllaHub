/**
 * Tipos e interfaces para o sistema de instalação MCP
 */

export type PackageRegistry = "npm" | "pypi" | "cargo" | "other" | null;

export enum MCPInstallationStatus {
  PENDING = "pending",
  CHECKING_DEPENDENCIES = "checking_dependencies",
  DOWNLOADING = "downloading",
  INSTALLING = "installing",
  TESTING = "testing",
  READY = "ready",
  FAILED = "failed",
}

export interface InstallationProgress {
  status: MCPInstallationStatus;
  message: string;
  percentage: number;
  logs?: string[];
}

export interface MCPEnvironment {
  type: "npm" | "python" | "rust";
  path: string;
  executable: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ValidationResult {
  success: boolean;
  protocol: "mcp" | "unknown";
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: any;
  }>;
  resources?: Array<{
    uri: string;
    name: string;
    description?: string;
  }>;
  error?: string;
  capabilities?: any;
}

export interface SystemDependencies {
  node: boolean;
  npm: boolean;
  python: boolean;
  pip: boolean;
  cargo: boolean;
  git: boolean;
}

export interface InstallationConfig {
  mcpId: string;
  packageName: string;
  packageRegistry: PackageRegistry;
  repositoryUrl?: string;
  config: any;
  enableLogs: boolean;
}
