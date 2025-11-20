'use client';

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface McpTool {
  name: string;
  description: string;
  input_schema?: any;
}

export interface McpToolInfo {
  server_name: string;
  tool: McpTool;
}

export function useMcpTools() {
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const allTools = await invoke<McpToolInfo[]>('get_all_mcp_tools');
      setTools(allTools);
    } catch (err) {
      console.error('Failed to load MCP tools:', err);
      setError(err instanceof Error ? err.message : 'Failed to load MCP tools');
      setTools([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTools();
    
    // Refresh tools every 30 seconds
    const interval = setInterval(() => {
      loadTools();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [loadTools]);

  // Generate tools context for prompt injection
  const generateToolsContext = useCallback((availableTools: McpToolInfo[], selectedServers?: string[]): string => {
    // Filter tools by selected servers if provided
    let filteredTools = availableTools;
    if (selectedServers && selectedServers.length > 0) {
      filteredTools = availableTools.filter(tool => selectedServers.includes(tool.server_name));
    }

    if (filteredTools.length === 0) {
      return '';
    }

    let context = '\n\n## Ferramentas MCP Disponíveis\n\n';
    const header = selectedServers && selectedServers.length > 0
      ? `Você está usando os servidores MCP selecionados: ${selectedServers.join(', ')}.\n`
      : 'Você tem acesso aos servidores MCP listados abaixo.\n';
    context += `${header}\n`;
    context += '### REGRAS OBRIGATÓRIAS PARA MCP:\n\n';
    context += '1. **PRIORIZE RESULTADOS DE MCP**: Se você vir mensagens anteriores marcadas com `[MCP servidor/ferramenta]`, USE-AS como base da sua resposta.\n';
    context += '2. **IDENTIFIQUE FONTES**: Quando há dados de MCP disponíveis, cite-os explicitamente (ex: "De acordo com a busca realizada...").\n';
    context += '3. **TRATE ERROS**: Se MCP retornou erro (mensagens com ⚠️), informe ao usuário sobre a limitação de forma clara.\n';
    context += '4. **SOLICITE FERRAMENTAS**: Use o formato `<tool_name>(arg1=valor1, arg2=valor2)` para solicitar execução de ferramentas.\n';
    context += '5. **PROIBIDO**: NUNCA gere blocos `<metadata>`, JSON oculto ou texto como "Metadados:". Apenas texto visível.\n\n';
    context += '**Nota**: O sistema executa MCPs automaticamente antes de você receber a mensagem do usuário. Verifique sempre se há resultados MCP nas mensagens anteriores.\n\n';

    // Group tools by server
    const toolsByServer = new Map<string, McpTool[]>();
    for (const toolInfo of filteredTools) {
      if (!toolsByServer.has(toolInfo.server_name)) {
        toolsByServer.set(toolInfo.server_name, []);
      }
      toolsByServer.get(toolInfo.server_name)!.push(toolInfo.tool);
    }

    // Format tools for each server
    for (const [serverName, serverTools] of toolsByServer.entries()) {
    context += `### Servidor: ${serverName}\n\n`;
      
      for (const tool of serverTools) {
        context += `- **${tool.name}**: ${tool.description}\n`;
        
        // Add input schema info if available
        if (tool.input_schema) {
          const schema = tool.input_schema;
          if (schema.properties) {
            context += `  - Parâmetros: `;
            const params: string[] = [];
            for (const [key, value] of Object.entries(schema.properties)) {
              const prop = value as any;
              params.push(`${key} (${prop.type || 'any'})`);
            }
            context += params.join(', ') + '\n';
          }
        }
        context += '\n';
      }
    }

    context += '### Como responder quando há dados MCP:\n\n';
    context += '1. Verifique se há mensagens com `[MCP ...]` no histórico recente\n';
    context += '2. Analise os dados retornados (mesmo que sejam erros)\n';
    context += '3. Baseie sua resposta PRINCIPALMENTE nos dados MCP\n';
    context += '4. Complemente com seu conhecimento apenas se necessário\n';
    context += '5. Apresente tudo em texto limpo, sem metadados ou JSON oculto\n\n';
    context += '**Lembre-se**: Resultados MCP são dados em tempo real e devem ter prioridade sobre seu conhecimento interno.\n';

    return context;
  }, []);

  // Get tools context string for prompt injection
  const getToolsContext = useCallback((selectedServers?: string[]): string => {
    return generateToolsContext(tools, selectedServers);
  }, [tools, generateToolsContext]);

  return {
    tools,
    isLoading,
    error,
    loadTools,
    generateToolsContext,
    getToolsContext,
  };
}



