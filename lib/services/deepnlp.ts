import { 
  DeepNLPSearchParams, 
  DeepNLPResponse, 
  MCPServerConfig, 
  MCPTool, 
  MCPProvider 
} from "@/lib/types/mcp";
import { MCPCache } from "@/lib/cache/mcp-cache";

const DEEPNLP_API_BASE = "https://www.deepnlp.org/api/mcp_marketplace/v1";

export class DeepNLPService {
  // Mapear categorias do projeto para categorias DeepNLP
  private static categoryMap = {
    productivity: ['office'],
    development: ['code', 'browser'],
    data: ['database'],
    integration: ['search', 'payment'],
    other: ['map', 'chart', 'finance']
  };

  // Mapear categorias DeepNLP para categorias internas
  private static reverseCategoryMap: Record<string, MCPProvider['category']> = {
    'office': 'office',
    'code': 'code',
    'browser': 'browser',
    'database': 'database',
    'search': 'search',
    'payment': 'payment',
    'map': 'map',
    'chart': 'chart',
    'finance': 'finance'
  };

  /**
   * Buscar servidores MCP na API DeepNLP
   */
  static async searchMCPs(params: DeepNLPSearchParams, retryCount = 0): Promise<DeepNLPResponse> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 segundo

    try {
      // Verificar cache primeiro
      const cacheKey = MCPCache.generateKey(params);
      const cachedResult = MCPCache.get(cacheKey);
      
      if (cachedResult) {
        console.log('Returning cached search results');
        return cachedResult;
      }

      const url = new URL(DEEPNLP_API_BASE);
      
      // Adicionar parâmetros de busca
      if (params.query) url.searchParams.set('query', params.query);
      if (params.category) url.searchParams.set('category', params.category);
      if (params.id) url.searchParams.set('id', params.id);
      if (params.page_id !== undefined) url.searchParams.set('page_id', params.page_id.toString());
      if (params.count_per_page !== undefined) url.searchParams.set('count_per_page', params.count_per_page.toString());
      if (params.offset !== undefined) url.searchParams.set('offset', params.offset.toString());
      if (params.mode) url.searchParams.set('mode', params.mode);

      console.log(`DeepNLP API Request (attempt ${retryCount + 1}):`, url.toString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Ollahub-MCP-Client/1.0'
        },
        // Timeout de 10 segundos
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`DeepNLP API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('DeepNLP API Response:', data);

      // Salvar no cache
      MCPCache.setWithDataType(cacheKey, data, 'search');

      return data;
    } catch (error) {
      console.error(`Error calling DeepNLP API (attempt ${retryCount + 1}):`, error);
      
      // Se ainda temos tentativas restantes, tentar novamente com backoff exponencial
      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount); // Backoff exponencial
        console.log(`Retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.searchMCPs(params, retryCount + 1);
      }
      
      // Se esgotamos as tentativas, lançar erro
      throw new Error(`Failed to fetch MCPs after ${maxRetries + 1} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Obter configuração completa de um servidor específico
   */
  static async getServerConfig(id: string, retryCount = 0): Promise<MCPServerConfig> {
    const maxRetries = 3;
    const baseDelay = 1000;

    try {
      // Verificar cache primeiro
      const cacheKey = MCPCache.generateServerConfigKey(id);
      const cachedResult = MCPCache.get(cacheKey);
      
      if (cachedResult) {
        console.log('Returning cached server config');
        return cachedResult;
      }

      const [owner, repo] = id.split('/');
      if (!owner || !repo) {
        throw new Error(`Invalid MCP ID format: ${id}. Expected format: owner/repo`);
      }

      const url = `${DEEPNLP_API_BASE}/server/${owner}/${repo}`;
      console.log(`DeepNLP Server Config Request (attempt ${retryCount + 1}):`, url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Ollahub-MCP-Client/1.0'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`DeepNLP Server Config API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('DeepNLP Server Config Response:', data);

      // Salvar no cache
      MCPCache.setWithDataType(cacheKey, data, 'config');

      return data;
    } catch (error) {
      console.error(`Error getting server config from DeepNLP (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(`Retrying server config in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.getServerConfig(id, retryCount + 1);
      }
      
      throw new Error(`Failed to get server config after ${maxRetries + 1} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Listar ferramentas de um servidor específico
   */
  static async getServerTools(id: string, retryCount = 0): Promise<MCPTool[]> {
    const maxRetries = 3;
    const baseDelay = 1000;

    try {
      // Verificar cache primeiro
      const cacheKey = MCPCache.generateServerToolsKey(id);
      const cachedResult = MCPCache.get(cacheKey);
      
      if (cachedResult) {
        console.log('Returning cached server tools');
        return cachedResult;
      }

      const [owner, repo] = id.split('/');
      if (!owner || !repo) {
        throw new Error(`Invalid MCP ID format: ${id}. Expected format: owner/repo`);
      }

      const url = `${DEEPNLP_API_BASE}/tools/${owner}/${repo}`;
      console.log(`DeepNLP Server Tools Request (attempt ${retryCount + 1}):`, url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Ollahub-MCP-Client/1.0'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`DeepNLP Server Tools API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('DeepNLP Server Tools Response:', data);

      const tools = data.tools || [];

      // Salvar no cache
      MCPCache.setWithDataType(cacheKey, tools, 'tools');

      return tools;
    } catch (error) {
      console.error(`Error getting server tools from DeepNLP (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(`Retrying server tools in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.getServerTools(id, retryCount + 1);
      }
      
      throw new Error(`Failed to get server tools after ${maxRetries + 1} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Transformar resposta DeepNLP para formato interno MCPProvider
   */
  static transformToMCPProvider(deepnlpItem: any): MCPProvider {
    const category = this.mapCategory(deepnlpItem.subfield || 'other');
    
    return {
      id: deepnlpItem.id || '',
      name: deepnlpItem.content_name || '',
      author: deepnlpItem.publisher_id || '',
      description: deepnlpItem.description || '',
      version: '1.0.0', // DeepNLP não fornece versão específica
      category,
      tags: deepnlpItem.content_tag_list ? deepnlpItem.content_tag_list.split(',').map((tag: string) => tag.trim()) : [],
      rating: parseFloat(deepnlpItem.rating || '0'),
      totalRatings: parseInt(deepnlpItem.review_cnt || '0'),
      downloads: parseInt(deepnlpItem.review_cnt || '0') * 10, // Estimativa baseada em reviews
      iconUrl: deepnlpItem.thumbnail_picture,
      screenshotUrls: [],
      capabilities: deepnlpItem.ext_info?.tools || [],
      repository: deepnlpItem.website,
      homepage: deepnlpItem.website,
      installed: false, // Será verificado localmente
      subfield: deepnlpItem.subfield,
      field: deepnlpItem.field,
      config: deepnlpItem.config,
      tools: deepnlpItem.ext_info?.tools || []
    };
  }

  /**
   * Mapear categoria DeepNLP para categoria interna
   */
  static mapCategory(subfield: string): MCPProvider['category'] {
    return this.reverseCategoryMap[subfield?.toLowerCase()] || 'other';
  }

  /**
   * Obter mapeamento de categoria interna para DeepNLP
   */
  static getCategoryMapping(internalCategory: string): string | undefined {
    const mappings = this.categoryMap[internalCategory as keyof typeof this.categoryMap];
    return mappings?.[0]; // Retorna a primeira categoria DeepNLP correspondente
  }

  /**
   * Verificar se a API está disponível
   */
  static async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${DEEPNLP_API_BASE}?count_per_page=1`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Ollahub-MCP-Client/1.0'
        }
      });
      return response.ok;
    } catch (error) {
      console.error('DeepNLP API health check failed:', error);
      return false;
    }
  }
}
