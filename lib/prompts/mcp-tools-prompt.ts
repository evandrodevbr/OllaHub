/**
 * Templates de prompt engineering para modelos sem suporte nativo a function calling
 */

import type { MCPTool } from "@/lib/types/mcp-chat";

/**
 * Gera prompt de instruções para uso de tools via prompt engineering
 * @param tools Array de tools disponíveis
 * @returns String com instruções formatadas
 */
export function generateToolsPrompt(tools: MCPTool[]): string {
  if (tools.length === 0) {
    return "";
  }

  const toolsDescription = tools
    .map((tool, index) => {
      const params = Object.entries(tool.inputSchema.properties || {})
        .map(([name, schema]: [string, any]) => {
          const required = tool.inputSchema.required?.includes(name)
            ? " (required)"
            : " (optional)";
          const type = schema.type || "any";
          const desc = schema.description || "";
          return `    - ${name}: ${type}${required}${desc ? ` - ${desc}` : ""}`;
        })
        .join("\n");

      return `${index + 1}. **${tool.name}**
   Description: ${tool.description}
   Parameters:
${params || "    (no parameters)"}`;
    })
    .join("\n\n");

  return `
# FERRAMENTAS DISPONÍVEIS

Você tem acesso às seguintes ferramentas externas para auxiliar o usuário:

${toolsDescription}

## INSTRUÇÕES IMPORTANTES

1. **Quando usar ferramentas:**
   - Use ferramentas quando precisar de informações em tempo real
   - Use ferramentas quando precisar executar ações externas
   - Use ferramentas quando o usuário solicitar dados específicos

2. **Como usar ferramentas:**
   - Para chamar uma ferramenta, responda EXATAMENTE no seguinte formato JSON:
   
   \`\`\`json
   {
     "tool_call": {
       "name": "nome_da_ferramenta",
       "parameters": {
         "parametro1": "valor1",
         "parametro2": "valor2"
       }
     }
   }
   \`\`\`

   - NÃO adicione texto antes ou depois do JSON
   - Certifique-se de que o JSON está bem formatado
   - Use apenas ferramentas da lista acima

3. **REGRA CRUCIAL - NUNCA MENCIONE AO USUÁRIO:**
   - NUNCA mencione que você está usando ferramentas
   - NUNCA mencione MCPs ou APIs externas
   - NUNCA diga "vou usar a ferramenta X"
   - NUNCA explique o processo técnico de como obteve informações
   - Apresente as informações naturalmente como se fossem seu conhecimento

4. **Após receber resultado da ferramenta:**
   - Você receberá uma mensagem do sistema com o resultado
   - Integre o resultado naturalmente na sua resposta
   - Responda ao usuário de forma fluida e natural
   - Cite informações específicas do resultado quando relevante

## EXEMPLO

Usuário: "Qual é o clima em São Paulo?"

Sua resposta:
\`\`\`json
{
  "tool_call": {
    "name": "get_weather",
    "parameters": {
      "city": "São Paulo"
    }
  }
}
\`\`\`

[Sistema retorna: {"temperature": 25, "condition": "sunny"}]

Sua resposta final ao usuário:
"O clima em São Paulo está ensolarado com 25°C."

**NÃO faça:**
"Vou consultar a ferramenta de clima para você..."
"Usei o get_weather e obtive..."
"De acordo com a API..."
`;
}

/**
 * Gera prompt condensado para economia de tokens
 * @param tools Array de tools disponíveis
 * @returns String com instruções compactas
 */
export function generateCompactToolsPrompt(tools: MCPTool[]): string {
  if (tools.length === 0) {
    return "";
  }

  const toolsList = tools
    .map((tool) => {
      const params = Object.keys(tool.inputSchema.properties || {}).join(", ");
      return `${tool.name}(${params}): ${tool.description}`;
    })
    .join("\n");

  return `
TOOLS: ${tools.length} available
${toolsList}

FORMAT: {"tool_call":{"name":"tool_name","parameters":{...}}}
RULE: Never mention tools to user. Present results naturally.
`;
}

/**
 * Extrai tool call de uma resposta do modelo
 * @param response Resposta do modelo
 * @returns Tool call extraído ou null
 */
export function extractToolCallFromResponse(response: string): {
  name: string;
  parameters: Record<string, any>;
} | null {
  try {
    // Tentar extrair JSON da resposta
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : response;

    const parsed = JSON.parse(jsonText.trim());

    // Formato atual suportado pelo prompt engineering
    if (parsed.tool_call && parsed.tool_call.name) {
      return {
        name: parsed.tool_call.name,
        parameters: parsed.tool_call.parameters || {},
      };
    }

    // Formato OpenAI-like: { type: 'function', function: { name, parameters|arguments } }
    // Algumas implementações usam `arguments` como string JSON
    if (parsed.type === "function" && parsed.function && parsed.function.name) {
      const fn = parsed.function;
      let params: any = fn.parameters ?? fn.arguments ?? {};
      if (typeof params === "string") {
        try {
          params = JSON.parse(params);
        } catch {
          // se não for JSON válido, mantém string (executor fará fallback)
        }
      }
      return { name: fn.name, parameters: params || {} };
    }

    // Formato simples: { name: "tool", parameters: {...} }
    if (parsed.name && (parsed.parameters || parsed.arguments)) {
      let params: any = parsed.parameters ?? parsed.arguments ?? {};
      if (typeof params === "string") {
        try {
          params = JSON.parse(params);
        } catch {
          // mantém string se não for JSON válido
        }
      }
      return { name: parsed.name, parameters: params || {} };
    }

    return null;
  } catch (error) {
    // Tentar extrair manualmente
    const nameMatch = response.match(/"name":\s*"([^"]+)"/);
    if (nameMatch) {
      const name = nameMatch[1];
      // Captura tanto parameters quanto arguments
      const paramsMatch =
        response.match(/"parameters"\s*:\s*({[\s\S]*?})/) ||
        response.match(/"arguments"\s*:\s*("[\s\S]*?"|{[\s\S]*?})/);
      let parameters: any = {};
      if (paramsMatch) {
        const raw = paramsMatch[1];
        try {
          parameters = JSON.parse(raw);
        } catch {
          // caso venha como string com JSON dentro de aspas
          if (raw.startsWith('"') && raw.endsWith('"')) {
            try {
              parameters = JSON.parse(raw.slice(1, -1));
            } catch {
              parameters = {};
            }
          }
        }
      }

      return { name, parameters };
    }

    return null;
  }
}

/**
 * Formata resultado de tool para injetar no contexto
 * @param toolName Nome do tool
 * @param result Resultado da execução
 * @returns Mensagem formatada para o sistema
 */
export function formatToolResultForContext(
  toolName: string,
  result: any
): string {
  const resultJson =
    typeof result === "string" ? result : JSON.stringify(result, null, 2);

  return `[TOOL RESULT - ${toolName}]
${resultJson}

[END TOOL RESULT]

Use as informações acima para responder ao usuário de forma natural. NÃO mencione que usou uma ferramenta.`;
}
