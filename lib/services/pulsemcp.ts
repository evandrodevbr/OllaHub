import {
  PulseMCPSearchParams,
  PulseMCPResponse,
  MCPServerMetadata,
  MCPProvider,
} from "@/lib/types/mcp";
import { MCPCache } from "@/lib/cache/mcp-cache";

const PULSEMCP_API_BASE = "https://api.pulsemcp.com/v0beta";

export class PulseMCPService {
  // Mapear categorias do PulseMCP para categorias internas
  private static categoryMap: Record<string, MCPProvider["category"]> = {
    filesystem: "other",
    github: "code",
    google: "search",
    brave: "search",
    postgres: "database",
    sqlite: "database",
    mongodb: "database",
    redis: "database",
    aws: "other",
    gcp: "other",
    azure: "other",
    slack: "other",
    discord: "other",
    notion: "office",
    confluence: "office",
    jira: "office",
    figma: "other",
    linear: "office",
    trello: "office",
    calendar: "office",
    email: "office",
    maps: "map",
    weather: "other",
    news: "other",
    finance: "finance",
    crypto: "finance",
    stocks: "finance",
    payment: "payment",
    stripe: "payment",
    paypal: "payment",
    chart: "chart",
    analytics: "chart",
    monitoring: "other",
    logging: "other",
    security: "other",
    auth: "other",
    api: "other",
    webhook: "other",
    scraping: "other",
    automation: "other",
    ai: "other",
    ml: "other",
    data: "other",
    etl: "other",
    visualization: "chart",
    reporting: "chart",
  };

  /**
   * Buscar todos os servidores MCP na API PulseMCP (sem parâmetros)
   * Com retry automático e backoff exponencial para rate limiting
   */
  static async getAllServers(retryCount = 0): Promise<PulseMCPResponse> {
    const maxRetries = 3;
    const baseDelay = 2000; // 2 segundos base

    try {
      if (retryCount > 0) {
        console.log(
          `📡 Retry ${retryCount}/${maxRetries} - Fetching from PulseMCP API...`
        );
      } else {
        console.log("📡 Fetching all servers from PulseMCP API...");
      }

      const response = await fetch(`${PULSEMCP_API_BASE}/servers`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Ollahub-MCP-Client/1.0 (https://ollahub.com)",
        },
        // Timeout de 30 segundos para download completo
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        // Se for 429 (Too Many Requests), tentar novamente com backoff
        if (response.status === 429 && retryCount < maxRetries) {
          const delay = baseDelay * Math.pow(2, retryCount); // Backoff exponencial
          console.warn(
            `⚠️ Rate limit hit (429). Waiting ${delay}ms before retry ${
              retryCount + 1
            }/${maxRetries}...`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.getAllServers(retryCount + 1);
        }

        throw new Error(
          `PulseMCP API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log(
        `✅ PulseMCP API returned ${data.servers.length} servers (total: ${data.total_count})`
      );

      return data;
    } catch (error) {
      // Se for erro de rate limit e ainda temos retries, tentar novamente
      if (
        error instanceof Error &&
        error.message.includes("429") &&
        retryCount < maxRetries
      ) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.warn(
          `⚠️ Rate limit error. Waiting ${delay}ms before retry ${
            retryCount + 1
          }/${maxRetries}...`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.getAllServers(retryCount + 1);
      }

      console.error("❌ Error calling PulseMCP API:", error);
      throw new Error(
        `Failed to fetch MCPs after ${retryCount + 1} attempts: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Transformar resposta PulseMCP para formato interno MCPProvider
   */
  static transformToMCPProvider(pulseMCPItem: MCPServerMetadata): MCPProvider {
    const meta = pulseMCPItem._meta?.["com.pulsemcp"];
    const category = this.mapCategory(
      pulseMCPItem.name,
      pulseMCPItem.short_description
    );

    // Usar name como ID se package_name não estiver disponível
    const id =
      pulseMCPItem.package_name ||
      pulseMCPItem.name.toLowerCase().replace(/[^a-z0-9]/g, "-");

    return {
      id: id,
      name: meta?.standardized_name || pulseMCPItem.name,
      author: meta?.standardized_provider_name || "Unknown",
      description:
        meta?.standardized_description || pulseMCPItem.short_description,
      version: "1.0.0", // PulseMCP não fornece versão específica
      category,
      tags: this.extractTags(pulseMCPItem.name, pulseMCPItem.short_description),
      rating: this.calculateRating(pulseMCPItem),
      totalRatings: pulseMCPItem.github_stars || 0,
      repository: pulseMCPItem.source_code_url,
      homepage: pulseMCPItem.external_url || pulseMCPItem.source_code_url,
      installed: false, // Será verificado localmente
      subfield: category.toUpperCase(),
      field: "MCP SERVER",
      config: this.generateConfigTemplate(pulseMCPItem),
      tools: [], // PulseMCP não fornece schemas de ferramentas
    };
  }

  /**
   * Mapear categoria baseada no nome e descrição
   */
  private static mapCategory(
    name: string,
    description: string
  ): MCPProvider["category"] {
    const text = `${name} ${description}`.toLowerCase();

    // Buscar por palavras-chave específicas
    for (const [keyword, category] of Object.entries(this.categoryMap)) {
      if (text.includes(keyword)) {
        return category;
      }
    }

    return "other";
  }

  /**
   * Extrair tags baseadas no nome e descrição
   */
  private static extractTags(name: string, description: string): string[] {
    const text = `${name} ${description}`.toLowerCase();
    const tags: string[] = [];

    // Tags comuns
    const commonTags = [
      "api",
      "database",
      "filesystem",
      "github",
      "google",
      "aws",
      "gcp",
      "azure",
      "slack",
      "discord",
      "notion",
      "calendar",
      "email",
      "maps",
      "weather",
      "finance",
      "crypto",
      "payment",
      "chart",
      "analytics",
      "monitoring",
      "security",
      "auth",
      "webhook",
      "scraping",
      "automation",
      "ai",
      "ml",
    ];

    for (const tag of commonTags) {
      if (text.includes(tag)) {
        tags.push(tag);
      }
    }

    return tags.slice(0, 5); // Limitar a 5 tags
  }

  /**
   * Calcular rating baseado em métricas disponíveis
   */
  private static calculateRating(item: MCPServerMetadata): number {
    const meta = item._meta?.["com.pulsemcp"];
    let rating = 3.0; // Rating base

    // Ajustar baseado em downloads
    if (meta?.estimated_downloads_all_time) {
      const downloads = meta.estimated_downloads_all_time;
      if (downloads > 1000000) rating += 1.0;
      else if (downloads > 100000) rating += 0.5;
      else if (downloads > 10000) rating += 0.2;
    }

    // Ajustar baseado em GitHub stars
    if (item.github_stars) {
      if (item.github_stars > 1000) rating += 0.5;
      else if (item.github_stars > 100) rating += 0.2;
    }

    // Ajustar se é oficial
    if (meta?.is_official) {
      rating += 0.5;
    }

    return Math.min(5.0, Math.max(1.0, rating));
  }

  /**
   * Extrair capacidades baseadas no nome e descrição
   */
  private static extractCapabilities(item: MCPServerMetadata): string[] {
    const text = `${item.name} ${item.short_description}`.toLowerCase();
    const capabilities: string[] = [];

    // Capacidades comuns
    const capabilityMap = {
      read: ["read", "get", "fetch", "retrieve"],
      write: ["write", "create", "update", "modify", "edit"],
      delete: ["delete", "remove", "destroy"],
      search: ["search", "find", "query", "filter"],
      sync: ["sync", "synchronize", "backup"],
      monitor: ["monitor", "watch", "track", "observe"],
      authenticate: ["auth", "login", "authenticate"],
      notify: ["notify", "alert", "message", "send"],
    };

    for (const [capability, keywords] of Object.entries(capabilityMap)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        capabilities.push(capability);
      }
    }

    return capabilities.slice(0, 5); // Limitar a 5 capacidades
  }

  /**
   * Gerar template de configuração para o servidor
   */
  private static generateConfigTemplate(item: MCPServerMetadata): any[] {
    const config: any[] = [];

    // Configuração básica
    config.push({
      type: "server",
      name: (item.package_name || item.name).replace(/^@[\w-]+\//, ""),
      command: this.getCommand(item.package_registry),
      args: this.getArgs(item),
    });

    // Adicionar variáveis de ambiente se necessário
    const envVars = this.getEnvTemplate(item);
    if (Object.keys(envVars).length > 0) {
      config.push({
        type: "env",
        variables: envVars,
      });
    }

    return config;
  }

  /**
   * Obter comando baseado no registry
   */
  private static getCommand(registry: string | null): string {
    switch (registry) {
      case "npm":
        return "npx";
      case "pypi":
        return "python";
      case "cargo":
        return "cargo";
      default:
        return "node";
    }
  }

  /**
   * Obter argumentos baseados no registry
   */
  private static getArgs(item: MCPServerMetadata): string[] {
    switch (item.package_registry) {
      case "npm":
        return ["-y", item.package_name || item.name];
      case "pypi":
        return ["-m", item.package_name || item.name];
      case "cargo":
        return ["run", "--bin", item.package_name || item.name];
      default:
        return [item.package_name || item.name];
    }
  }

  /**
   * Obter template de variáveis de ambiente
   */
  private static getEnvTemplate(
    item: MCPServerMetadata
  ): Record<string, string> {
    const template: Record<string, string> = {};
    const text = `${item.name} ${item.short_description}`.toLowerCase();

    // Templates comuns baseados em palavras-chave
    if (text.includes("google")) {
      template.GOOGLE_API_KEY = "your-google-api-key";
    }
    if (text.includes("github")) {
      template.GITHUB_TOKEN = "your-github-token";
    }
    if (text.includes("openai")) {
      template.OPENAI_API_KEY = "your-openai-api-key";
    }
    if (text.includes("aws")) {
      template.AWS_ACCESS_KEY_ID = "your-aws-access-key";
      template.AWS_SECRET_ACCESS_KEY = "your-aws-secret-key";
    }
    if (text.includes("slack")) {
      template.SLACK_BOT_TOKEN = "your-slack-bot-token";
    }
    if (text.includes("discord")) {
      template.DISCORD_TOKEN = "your-discord-token";
    }

    return template;
  }

  /**
   * Verificar se a API está disponível
   */
  static async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(
        `${PULSEMCP_API_BASE}/servers?count_per_page=1`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "Ollahub-MCP-Client/1.0 (https://ollahub.com)",
          },
        }
      );
      return response.ok;
    } catch (error) {
      console.error("PulseMCP API health check failed:", error);
      return false;
    }
  }

  /**
   * Obter servidores populares
   */
  static async getPopularServers(
    limit: number = 10
  ): Promise<MCPServerMetadata[]> {
    try {
      const response = await this.getAllServers();

      return response.servers
        .sort((a: MCPServerMetadata, b: MCPServerMetadata) => {
          const aDownloads =
            a._meta?.["com.pulsemcp"]?.estimated_downloads_all_time || 0;
          const bDownloads =
            b._meta?.["com.pulsemcp"]?.estimated_downloads_all_time || 0;
          return bDownloads - aDownloads;
        })
        .slice(0, limit);
    } catch (error) {
      console.error("Error getting popular servers:", error);
      return [];
    }
  }

  /**
   * Buscar servidores por integração específica
   */
  static async getServersByIntegration(
    integration: string
  ): Promise<MCPServerMetadata[]> {
    try {
      const response = await this.getAllServers();
      // Filtrar servidores que contenham a integração no nome ou descrição
      return response.servers.filter(
        (server) =>
          server.name.toLowerCase().includes(integration.toLowerCase()) ||
          server.short_description
            .toLowerCase()
            .includes(integration.toLowerCase())
      );
    } catch (error) {
      console.error(
        `Error getting servers for integration ${integration}:`,
        error
      );
      return [];
    }
  }
}
