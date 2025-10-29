/**
 * Serviço para detectar capabilities de function calling dos modelos
 */

import type { ModelCapabilities } from "@/lib/types/mcp-chat";

/**
 * Lista de modelos com suporte nativo a function calling
 * Baseado na documentação do Ollama (atualizado em nov 2024)
 */
const MODELS_WITH_NATIVE_TOOLS = [
  // Llama 3.x
  /^llama3\.1/i,
  /^llama3\.2/i,
  /^llama3-/i,

  // Mistral
  /^mistral/i,
  /^mistral-nemo/i,
  /^mixtral/i,

  // Gemma
  /^gemma2/i,

  // Qwen
  /^qwen2\.5/i,

  // Command-R
  /^command-r/i,

  // Firefunction
  /^firefunction/i,
];

/**
 * Detecta capabilities de function calling de um modelo
 * @param modelName Nome do modelo (ex: "llama3.1:8b", "qwen2.5:7b")
 * @returns Capabilities do modelo
 */
export function detectModelCapabilities(modelName: string): ModelCapabilities {
  const supportsNativeTools = MODELS_WITH_NATIVE_TOOLS.some((pattern) =>
    pattern.test(modelName)
  );

  return {
    modelName,
    supportsNativeTools,
    requiresPromptEngineering: !supportsNativeTools,
    toolCallFormat: supportsNativeTools ? "openai" : undefined,
  };
}

/**
 * Verifica se um modelo específico suporta function calling nativo
 * @param modelName Nome do modelo
 * @returns true se suporta, false caso contrário
 */
export function supportsNativeTools(modelName: string): boolean {
  return detectModelCapabilities(modelName).supportsNativeTools;
}

/**
 * Lista todos os modelos conhecidos com suporte a function calling
 * @returns Array de padrões regex em string
 */
export function getSupportedModelsPatterns(): string[] {
  return [
    "llama3.1:*",
    "llama3.2:*",
    "mistral:*",
    "mixtral:*",
    "gemma2:*",
    "qwen2.5:*",
    "command-r:*",
    "firefunction:*",
  ];
}
