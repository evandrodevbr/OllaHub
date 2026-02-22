'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '@/store/settings-store';
import { invoke } from '@tauri-apps/api/core';
import { Zap, Cpu } from 'lucide-react';

interface LocalGgufModel {
  path: string;
  name: string;
  size: number;
  quantization?: string;
  architecture?: string;
}

export function RuntimeSettingsPanel() {
  const { runtime, llamaCppParams, setRuntime, setLlamaCppParams } = useSettingsStore();
  const [localModels, setLocalModels] = useState<LocalGgufModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLocalModels();
  }, []);

  const loadLocalModels = async () => {
    try {
      setLoading(true);
      const models = await invoke<LocalGgufModel[]>('list_local_gguf_models');
      setLocalModels(models);
    } catch (error) {
      console.error('Failed to load local GGUF models:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasLocalModels = localModels.length > 0;
  const isLlamaCppAvailable = hasLocalModels;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime de Modelos</CardTitle>
        <CardDescription>
          Escolha entre Ollama (servidor externo) ou llama.cpp nativo (mais rápido, sem servidor)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle de Runtime */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="runtime-toggle">Usar llama.cpp nativo</Label>
            <p className="text-sm text-muted-foreground">
              {runtime === 'ollama'
                ? 'Usando Ollama como runtime (requer servidor externo)'
                : 'Usando llama.cpp nativo (mais rápido, sem servidor externo)'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={runtime === 'ollama' ? 'default' : 'secondary'} className="gap-1">
                    {runtime === 'ollama' ? (
                      <>
                        <span>🦙</span> Ollama
                      </>
                    ) : (
                      <>
                        <Zap className="h-3 w-3" />
                        llama.cpp
                      </>
                    )}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {runtime === 'ollama'
                    ? 'Usando Ollama como runtime (requer servidor externo)'
                    : 'Usando llama.cpp nativo (mais rápido, sem servidor externo)'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Switch
              id="runtime-toggle"
              checked={runtime === 'llama-cpp'}
              onCheckedChange={(checked) => setRuntime(checked ? 'llama-cpp' : 'ollama')}
              disabled={!isLlamaCppAvailable}
            />
          </div>
        </div>

        {!isLlamaCppAvailable && (
          <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm text-yellow-800 dark:text-yellow-200">
            <p>
              Nenhum modelo GGUF local encontrado. Baixe modelos do Hugging Face para usar llama.cpp nativo.
            </p>
          </div>
        )}

        {loading && (
          <div className="text-sm text-muted-foreground">Carregando modelos locais...</div>
        )}

        {hasLocalModels && (
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm font-medium mb-2">
              Modelos GGUF locais encontrados: {localModels.length}
            </p>
            <div className="space-y-1">
              {localModels.slice(0, 5).map((model, idx) => (
                <div key={idx} className="text-xs text-muted-foreground">
                  • {model.name} {model.quantization && `(${model.quantization})`}
                </div>
              ))}
              {localModels.length > 5 && (
                <div className="text-xs text-muted-foreground">
                  ... e mais {localModels.length - 5} modelo(s)
                </div>
              )}
            </div>
          </div>
        )}

        {/* Configurações do llama.cpp */}
        {runtime === 'llama-cpp' && (
          <div className="space-y-4 pt-4 border-t">
            <div>
              <Label>Camadas GPU (n_gpu_layers)</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Número de camadas para carregar na GPU. 0 = CPU apenas
              </p>
              <div className="flex items-center gap-4">
                <Slider
                  value={[llamaCppParams.nGpuLayers]}
                  onValueChange={([value]) =>
                    setLlamaCppParams({ nGpuLayers: value })
                  }
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={llamaCppParams.nGpuLayers}
                  onChange={(e) =>
                    setLlamaCppParams({ nGpuLayers: parseInt(e.target.value) || 0 })
                  }
                  className="w-20"
                  min={0}
                  max={100}
                />
              </div>
            </div>

            <div>
              <Label>Tamanho do Contexto (n_ctx)</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Tamanho máximo do contexto em tokens
              </p>
              <div className="flex items-center gap-4">
                <Slider
                  value={[llamaCppParams.nCtx]}
                  onValueChange={([value]) =>
                    setLlamaCppParams({ nCtx: value })
                  }
                  min={512}
                  max={32768}
                  step={512}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={llamaCppParams.nCtx}
                  onChange={(e) =>
                    setLlamaCppParams({ nCtx: parseInt(e.target.value) || 4096 })
                  }
                  className="w-24"
                  min={512}
                  max={32768}
                  step={512}
                />
              </div>
            </div>

            <div>
              <Label>Threads</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Número de threads (0 = automático)
              </p>
              <Input
                type="number"
                value={llamaCppParams.threads || 0}
                onChange={(e) =>
                  setLlamaCppParams({ threads: parseInt(e.target.value) || 0 })
                }
                className="w-32"
                min={0}
                max={32}
              />
            </div>

            <div>
              <Label>Temperatura</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Controla a aleatoriedade das respostas (0.0 - 2.0)
              </p>
              <div className="flex items-center gap-4">
                <Slider
                  value={[llamaCppParams.temperature]}
                  onValueChange={([value]) =>
                    setLlamaCppParams({ temperature: value })
                  }
                  min={0}
                  max={2}
                  step={0.1}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={llamaCppParams.temperature}
                  onChange={(e) =>
                    setLlamaCppParams({ temperature: parseFloat(e.target.value) || 0.7 })
                  }
                  className="w-20"
                  min={0}
                  max={2}
                  step={0.1}
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
