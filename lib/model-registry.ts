import { LocalModel } from '@/hooks/use-local-models';

// Interfaces based on the JSON structure
export interface ModelVariant {
  name: string;
  size: string;
  context: string;
  inputType: string;
}

export interface ModelDefinition {
  model: string;
  url: string;
  description: string;
  variantsCount: number;
  variants: ModelVariant[];
}

// Import model definitions
// We use a static list as dynamic imports of JSONs are not trivial in client-side bundles without API routes
import aya from '@/data/models/aya.json';
import codellama from '@/data/models/codellama.json';
import commandR from '@/data/models/command-r.json';
import commandRPlus from '@/data/models/command-r-plus.json';
import deepseekCoder from '@/data/models/deepseek-coder.json';
import deepseekLLM from '@/data/models/deepseek-llm.json';
import deepseekV2 from '@/data/models/deepseek-v2.json';
import deepseekV25 from '@/data/models/deepseek-v2.5.json';
import deepseekV3 from '@/data/models/deepseek-v3.json';
import falcon from '@/data/models/falcon.json';
import gemma from '@/data/models/gemma.json';
import gemma2 from '@/data/models/gemma2.json';
import llama2 from '@/data/models/llama2.json';
import llama2Uncensored from '@/data/models/llama2-uncensored.json';
import llama3 from '@/data/models/llama3.json';
import llama31 from '@/data/models/llama3.1.json';
import llama32 from '@/data/models/llama3.2.json';
import llama32Vision from '@/data/models/llama3.2-vision.json';
import llama33 from '@/data/models/llama3.3.json';
import llava from '@/data/models/llava.json';
import mistral from '@/data/models/mistral.json';
import mistralNemo from '@/data/models/mistral-nemo.json';
import mixtral from '@/data/models/mixtral.json';
import moondream from '@/data/models/moondream.json';
import neuralChat from '@/data/models/neural-chat.json';
import openhermes from '@/data/models/openhermes.json';
import orcaMini from '@/data/models/orca-mini.json';
import phi from '@/data/models/phi.json';
import phi3 from '@/data/models/phi3.json';
import phi35 from '@/data/models/phi3.5.json';
import phi4 from '@/data/models/phi4.json';
import qwen from '@/data/models/qwen.json';
import qwen2 from '@/data/models/qwen2.json';
import qwen25 from '@/data/models/qwen2.5.json';
import qwen25Coder from '@/data/models/qwen2.5-coder.json';
import starlingLM from '@/data/models/starling-lm.json';
import tinyllama from '@/data/models/tinyllama.json';
import vicuna from '@/data/models/vicuna.json';
import wizardVicunaUncensored from '@/data/models/wizard-vicuna-uncensored.json';
import yi from '@/data/models/yi.json';
import zephyr from '@/data/models/zephyr.json';

// Aggregate into a registry
export const MODEL_REGISTRY: ModelDefinition[] = [
  aya,
  codellama,
  commandR,
  commandRPlus,
  deepseekCoder,
  deepseekLLM,
  deepseekV2,
  deepseekV25,
  deepseekV3,
  falcon,
  gemma,
  gemma2,
  llama2,
  llama2Uncensored,
  llama3,
  llama31,
  llama32,
  llama32Vision,
  llama33,
  llava,
  mistral,
  mistralNemo,
  mixtral,
  moondream,
  neuralChat,
  openhermes,
  orcaMini,
  phi,
  phi3,
  phi35,
  phi4,
  qwen,
  qwen2,
  qwen25,
  qwen25Coder,
  starlingLM,
  tinyllama,
  vicuna,
  wizardVicunaUncensored,
  yi,
  zephyr,
] as ModelDefinition[];

// Helper to find a model definition by one of its variant names
export function findModelDefinition(variantName: string): ModelDefinition | undefined {
  // Remove tag to match base model name roughly?
  // Or search all variants
  const cleanName = variantName.split(':')[0];
  
  // First try to find by exact match in variants
  const exactMatch = MODEL_REGISTRY.find(def => 
    def.variants.some(v => v.name === variantName)
  );
  if (exactMatch) return exactMatch;

  // Then try to match by model ID/name
  return MODEL_REGISTRY.find(def => def.model === cleanName);
}

export function getInstalledModels(
  registry: ModelDefinition[], 
  installed: LocalModel[]
): ModelDefinition[] {
  const installedNames = new Set(installed.map(m => m.name));
  return registry.filter(def => 
    def.variants.some(v => installedNames.has(v.name))
  );
}

export function getAvailableModels(
  registry: ModelDefinition[], 
  installed: LocalModel[]
): ModelDefinition[] {
  const installedNames = new Set(installed.map(m => m.name));
  return registry.filter(def => 
    !def.variants.some(v => installedNames.has(v.name))
  );
}
