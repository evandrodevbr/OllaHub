import { useState, useMemo } from 'react';
import { useLocalModels, LocalModel } from '@/hooks/use-local-models';
import { MODEL_REGISTRY, ModelDefinition } from '@/lib/model-registry';

const STORAGE_KEY = 'last_used_model';

export interface UseModelSelectionResult {
  myModels: ModelDefinition[];
  availableModels: ModelDefinition[];
  selectedModel: string | null;
  setSelectedModel: (model: string) => void;
  isLoading: boolean;
  installedVariantsByFamily: Record<string, string[]>;
  refreshModels: () => Promise<void>;
}

export function useModelSelection(): UseModelSelectionResult {
  const { models: installedModels, loading: isLoadingModels, refresh: refreshLocalModels } = useLocalModels();
  const [selectedModel, setSelectedModelState] = useState<string | null>(null);

  const { myModels, availableModels } = useMemo(() => {
    const installedNames = new Set(installedModels.map(m => m.name));
    const my: ModelDefinition[] = [];
    const available: ModelDefinition[] = [];
    const registryByModel = new Map<string, ModelDefinition>();
    for (const def of MODEL_REGISTRY) {
      registryByModel.set(def.model, def);
    }

    for (const def of MODEL_REGISTRY) {
      const isInstalled = def.variants.some(v => installedNames.has(v.name));
      if (isInstalled) {
        my.push(def);
      } else {
        available.push(def);
      }
    }

    const installedByBase = new Map<string, LocalModel[]>();
    for (const m of installedModels) {
      const base = m.name.split(':')[0];
      const list = installedByBase.get(base) || [];
      list.push(m);
      installedByBase.set(base, list);
    }

    for (const [base, models] of installedByBase.entries()) {
      if (!registryByModel.has(base)) {
        const variants = models.map((m) => ({
          name: m.name,
          size: m.size,
          context: 'Unknown',
          inputType: 'Text',
        }));
        my.push({
          model: base,
          url: '',
          description: 'Modelo instalado localmente',
          variantsCount: variants.length,
          variants,
        });
      }
    }

    return { myModels: my, availableModels: available };
  }, [installedModels]);

  const installedVariantsByFamily = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const m of installedModels) {
      const base = m.name.split(':')[0];
      if (!map[base]) map[base] = [];
      map[base].push(m.name);
    }
    return map;
  }, [installedModels]);

  const defaultSelectedModel = useMemo(() => {
    if (isLoadingModels) return null;
    const lastUsed = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const installedNames = installedModels.map(m => m.name);
    if (lastUsed && installedNames.includes(lastUsed)) return lastUsed;
    if (installedModels.length > 0) return installedModels[0].name;
    return null;
  }, [installedModels, isLoadingModels]);

  // Persistence wrapper
  const setSelectedModel = (model: string) => {
    setSelectedModelState(model);
    localStorage.setItem(STORAGE_KEY, model);
  };

  return {
    myModels,
    availableModels,
    selectedModel: selectedModel ?? defaultSelectedModel,
    setSelectedModel,
    isLoading: isLoadingModels,
    installedVariantsByFamily,
    refreshModels: refreshLocalModels,
  };
}
