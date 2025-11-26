import type { Message } from '@/hooks/use-chat';
import { useSettingsStore } from '@/store/settings-store';

export interface ModelContextInfo {
  modelName: string;
  maxContextWindow: number;
  recommendedContextWindow: number;
}

/**
 * Estima tokens de um texto (aproximação: 1 token ≈ 4 caracteres)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Detecta o context window máximo do modelo consultando Ollama API
 * 
 * @param modelName - Nome do modelo
 * @returns Limite máximo de tokens do modelo
 */
export async function detectModelContextWindow(modelName: string): Promise<number> {
  if (!modelName) {
    // Fallback para settings
    const settings = useSettingsStore.getState();
    return settings.contextWindow || 4096;
  }

  try {
    // Tentar obter informações do modelo via Ollama API
    const response = await fetch('http://localhost:11434/api/show', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: modelName,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      
      // Ollama retorna 'context_length' ou 'parameter_size' que pode indicar contexto
      // Mapear tamanhos conhecidos de modelos
      const modelInfo = data.modelfile || '';
      const contextMatch = modelInfo.match(/context[_\s]*length[:\s]*(\d+)/i);
      
      if (contextMatch) {
        return parseInt(contextMatch[1], 10);
      }

      // Tentar inferir do tamanho do modelo
      const size = data.size || '';
      if (size.includes('7b') || size.includes('8b')) {
        return 8192; // Modelos 7B-8B geralmente têm 8k
      }
      if (size.includes('13b') || size.includes('14b')) {
        return 16384; // Modelos 13B-14B geralmente têm 16k
      }
      if (size.includes('32k') || size.includes('128k')) {
        return 32768; // Modelos com contexto estendido
      }
    }
  } catch (error) {
    console.warn('Erro ao detectar context window do modelo:', error);
  }

  // Fallback: usar contextWindow das settings
  const settings = useSettingsStore.getState();
  return settings.contextWindow || 4096;
}

/**
 * Calcula tokens disponíveis para Knowledge Base
 * 
 * @param systemPrompt - System prompt
 * @param messages - Mensagens do histórico
 * @param modelMaxTokens - Limite máximo de tokens do modelo
 * @returns Tokens disponíveis para Knowledge Base
 */
export function calculateAvailableTokens(
  systemPrompt: string,
  messages: Message[],
  modelMaxTokens: number
): number {
  // Calcular tokens usados
  let usedTokens = 0;

  // System prompt
  if (systemPrompt) {
    usedTokens += estimateTokens(systemPrompt);
  }

  // Mensagens do histórico
  messages.forEach(msg => {
    usedTokens += estimateTokens(msg.content);
  });

  // Reservar 10% para margem de segurança e resposta da IA
  const reservedTokens = Math.ceil(modelMaxTokens * 0.1);
  const availableTokens = modelMaxTokens - usedTokens - reservedTokens;

  // Garantir mínimo de 1000 tokens disponíveis
  return Math.max(availableTokens, 1000);
}

/**
 * Obtém informações completas do contexto do modelo
 * 
 * @param modelName - Nome do modelo
 * @param systemPrompt - System prompt atual
 * @param messages - Mensagens do histórico
 * @returns Informações do contexto
 */
export async function getModelContextInfo(
  modelName: string,
  systemPrompt: string = '',
  messages: Message[] = []
): Promise<ModelContextInfo> {
  const maxContextWindow = await detectModelContextWindow(modelName);
  const availableTokens = calculateAvailableTokens(systemPrompt, messages, maxContextWindow);
  
  // Recommended é 80% do disponível para garantir margem
  const recommendedContextWindow = Math.floor(availableTokens * 0.8);

  return {
    modelName,
    maxContextWindow,
    recommendedContextWindow,
  };
}


