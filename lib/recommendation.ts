export interface GpuInfo {
  id: string;
  name: string;
  vendor: string | null;
  memory_mb: number | null;
}

export interface SystemSpecs {
  total_memory: number; // Bytes
  cpu_count: number;
  os_name: string;
  gpus: GpuInfo[];
}

export interface ModelRecommendation {
  modelId: string;
  reason: string;
  minRam: number; // GB
}

export const RECOMMENDED_MODELS = [
  { id: 'llama3.2:1b', name: 'Llama 3.2 1B', size: '1.3GB', minRam: 4 },
  { id: 'llama3.2:3b', name: 'Llama 3.2 3B', size: '2.0GB', minRam: 8 },
  { id: 'gemma2:9b', name: 'Gemma 2 9B', size: '5.4GB', minRam: 12 },
  { id: 'llama3.1:8b', name: 'Llama 3.1 8B', size: '4.7GB', minRam: 16 },
  { id: 'mistral:latest', name: 'Mistral 7B', size: '4.1GB', minRam: 16 },
];

export function getRecommendation(specs: SystemSpecs): ModelRecommendation {
  const ramGB = specs.total_memory / (1024 * 1024 * 1024);

  if (ramGB < 8) {
    return {
      modelId: 'llama3.2:1b',
      reason: 'Ideal para sistemas com pouca memória (< 8GB). Rápido e leve.',
      minRam: 4
    };
  }

  if (ramGB < 12) {
    return {
      modelId: 'llama3.2:3b',
      reason: 'Equilíbrio perfeito entre velocidade e inteligência para seu sistema.',
      minRam: 8
    };
  }

  if (ramGB < 16) {
    return {
      modelId: 'gemma2:9b',
      reason: 'Modelo avançado do Google, ótimo para raciocínio.',
      minRam: 12
    };
  }

  return {
    modelId: 'llama3.1:8b',
    reason: 'Padrão da indústria. Alta capacidade de raciocínio e conhecimento geral.',
    minRam: 16
  };
}

