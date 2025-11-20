import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface LocalModel {
  name: string;
  size: string;
  id: string;
  modified_at: string;
}

export function useLocalModels() {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<LocalModel[]>('list_local_models');
      setModels(list);
    } catch (error) {
      console.error("Failed to list models:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteModel = async (name: string) => {
    try {
      await invoke('delete_model', { name });
      await fetchModels(); // Refresh list
    } catch (error) {
      console.error("Failed to delete model:", error);
      throw error;
    }
  };

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  return { models, loading, refresh: fetchModels, deleteModel };
}



