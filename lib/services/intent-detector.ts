/**
 * Serviço para detectar intenções do usuário através de palavras-chave
 */

import type { DetectedIntent } from "@/lib/types/mcp-chat";

/**
 * Padrões de keywords para cada tipo de intent
 */
const INTENT_PATTERNS = {
  web_search: {
    keywords: [
      "buscar",
      "pesquisar",
      "procurar",
      "google",
      "encontrar",
      "search",
      "look up",
      "find",
      "o que é",
      "quem é",
      "onde fica",
    ],
    regex:
      /\b(buscar|pesquisar|procurar|google|encontrar|search|look up|find)\b/i,
  },
  time: {
    keywords: [
      "que horas",
      "data",
      "horário",
      "hoje",
      "agora",
      "quando",
      "calendário",
      "time",
      "date",
      "current time",
      "what time",
    ],
    regex:
      /\b(que horas|data|horário|hoje|agora|quando|time|date|current time)\b/i,
  },
  weather: {
    keywords: [
      "clima",
      "tempo",
      "temperatura",
      "chuva",
      "previsão",
      "weather",
      "forecast",
      "temperature",
    ],
    regex:
      /\b(clima|tempo|temperatura|chuva|previsão|weather|forecast|temperature)\b/i,
  },
  file: {
    keywords: [
      "arquivo",
      "pasta",
      "diretório",
      "file",
      "folder",
      "directory",
      "ler arquivo",
      "read file",
      "listar",
      "list",
    ],
    regex:
      /\b(arquivo|pasta|diretório|file|folder|directory|ler arquivo|read file)\b/i,
  },
  code: {
    keywords: [
      "código",
      "programar",
      "executar",
      "run",
      "execute",
      "compile",
      "debug",
      "git",
      "commit",
    ],
    regex:
      /\b(código|programar|executar|run|execute|compile|debug|git|commit)\b/i,
  },
  database: {
    keywords: [
      "banco de dados",
      "database",
      "query",
      "sql",
      "select",
      "insert",
      "update",
      "delete",
    ],
    regex:
      /\b(banco de dados|database|query|sql|select|insert|update|delete)\b/i,
  },
};

/**
 * Detecta a intenção do usuário na mensagem
 * @param message Mensagem do usuário
 * @returns Intent detectado ou null
 */
export function detectIntent(message: string): DetectedIntent | null {
  const messageLower = message.toLowerCase();

  for (const [type, pattern] of Object.entries(INTENT_PATTERNS)) {
    const matches = pattern.regex.test(messageLower);

    if (matches) {
      // Calcular confiança baseado em quantas keywords foram encontradas
      const foundKeywords = pattern.keywords.filter((keyword) =>
        messageLower.includes(keyword.toLowerCase())
      );

      const confidence = Math.min(0.5 + foundKeywords.length * 0.2, 1.0);

      return {
        type: type as DetectedIntent["type"],
        confidence,
        keywords: foundKeywords,
        suggestedTools: getSuggestedToolsForIntent(
          type as DetectedIntent["type"]
        ),
      };
    }
  }

  return null;
}

/**
 * Retorna tools sugeridos para um tipo de intent
 * @param intentType Tipo de intent
 * @returns Array de nomes de tools sugeridos
 */
function getSuggestedToolsForIntent(
  intentType: DetectedIntent["type"]
): string[] {
  const toolMapping: Record<DetectedIntent["type"], string[]> = {
    web_search: ["web_search", "duckduckgo_search", "google_search", "search"],
    time: ["get_current_time", "get_date", "current_time", "time"],
    weather: ["get_weather", "weather", "forecast"],
    file: ["read_file", "list_files", "filesystem", "file"],
    code: ["execute_code", "git", "run_command"],
    database: ["query", "sql", "database"],
    other: [],
  };

  return toolMapping[intentType] || [];
}

/**
 * Verifica se um tool name corresponde a algum intent detectado
 * @param toolName Nome do tool
 * @param intent Intent detectado
 * @returns true se o tool é relevante para o intent
 */
export function isToolRelevantForIntent(
  toolName: string,
  intent: DetectedIntent
): boolean {
  const toolNameLower = toolName.toLowerCase();
  return intent.suggestedTools.some((suggested) =>
    toolNameLower.includes(suggested.toLowerCase())
  );
}

/**
 * Filtra tools com base em um intent detectado
 * @param tools Array de tools disponíveis
 * @param intent Intent detectado
 * @returns Tools filtrados e ordenados por relevância
 */
export function filterToolsByIntent(
  tools: Array<{ name: string; description: string }>,
  intent: DetectedIntent
): Array<{ name: string; description: string; relevance: number }> {
  return tools
    .map((tool) => {
      let relevance = 0;

      // Verificar se o tool name contém alguma keyword sugerida
      const toolNameLower = tool.name.toLowerCase();
      for (const suggested of intent.suggestedTools) {
        if (toolNameLower.includes(suggested.toLowerCase())) {
          relevance += 2;
        }
      }

      // Verificar se a descrição contém keywords do intent
      const descriptionLower = tool.description.toLowerCase();
      for (const keyword of intent.keywords) {
        if (descriptionLower.includes(keyword.toLowerCase())) {
          relevance += 1;
        }
      }

      return { ...tool, relevance };
    })
    .filter((tool) => tool.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance);
}
