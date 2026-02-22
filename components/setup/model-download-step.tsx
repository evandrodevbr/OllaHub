'use client';

import { useEffect, useMemo, useState, useCallback, startTransition } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSetupWizard } from '@/hooks/use-setup-wizard';
import { useDownloadContext } from '@/contexts/download-context';
import { Search, Download, CheckCircle2, AlertCircle, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModelInfo {
  id: string;
  name: string;
  size: string;
  minRam: number;
  description?: string;
}

// Lista expandida de modelos populares
const POPULAR_MODELS: ModelInfo[] = [
  { id: 'llama3.2:1b', name: 'Llama 3.2 1B', size: '1.3GB', minRam: 4, description: 'Leve e rápido, ideal para iniciantes' },
  { id: 'llama3.2:3b', name: 'Llama 3.2 3B', size: '2.0GB', minRam: 8, description: 'Equilíbrio perfeito entre velocidade e qualidade' },
  { id: 'llama3.1:8b', name: 'Llama 3.1 8B', size: '4.7GB', minRam: 16, description: 'Padrão da indústria, alta capacidade' },
  { id: 'mistral:latest', name: 'Mistral 7B', size: '4.1GB', minRam: 16, description: 'Excelente para raciocínio e código' },
  { id: 'gemma2:9b', name: 'Gemma 2 9B', size: '5.4GB', minRam: 12, description: 'Modelo avançado do Google' },
  { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', size: '4.5GB', minRam: 16, description: 'Multilíngue e versátil' },
  { id: 'phi3:mini', name: 'Phi-3 Mini', size: '2.3GB', minRam: 8, description: 'Compacto e eficiente da Microsoft' },
  { id: 'deepseek-coder:6.7b', name: 'DeepSeek Coder 6.7B', size: '4.2GB', minRam: 16, description: 'Especializado em programação' },
];

interface ModelDownloadStepProps {
  onNext: () => void;
}

export function ModelDownloadStep({ onNext }: ModelDownloadStepProps) {
  const { state, checkSetupState } = useSetupWizard();
  const { state: downloadState, startDownload } = useDownloadContext();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [activeModelTag, setActiveModelTag] = useState<string | null>(null);
  const [installedModels, setInstalledModels] = useState<Set<string>>(new Set());
  const [customModelInstalled, setCustomModelInstalled] = useState(false);

  // Verificar modelos instalados ao montar
  useEffect(() => {
    const checkAllModels = async () => {
      const installed = new Set<string>();
      
      // Verificar todos os modelos em paralelo
      const checks = POPULAR_MODELS.map(async (model) => {
        try {
          const isInstalled = await invoke<boolean>('check_if_model_installed_command', { name: model.id });
          if (isInstalled) {
            installed.add(model.id);
          }
        } catch (error) {
          console.error(`Erro ao verificar ${model.id}:`, error);
        }
      });
      
      await Promise.all(checks);
      startTransition(() => {
        setInstalledModels(installed);
      });
    };
    
    checkAllModels();
  }, []);

  // Verificar modelo customizado quando o usuário digita
  useEffect(() => {
    const checkCustomModel = async () => {
      const modelTag = customModelInput.trim();
      if (!modelTag) {
        setCustomModelInstalled(false);
        return;
      }
      
      try {
        const isInstalled = await invoke<boolean>('check_if_model_installed_command', { name: modelTag });
        setCustomModelInstalled(isInstalled);
      } catch (error) {
        console.error(`Erro ao verificar modelo customizado ${modelTag}:`, error);
        setCustomModelInstalled(false);
      }
    };
    
    // Debounce: aguardar 500ms após o usuário parar de digitar
    const timer = setTimeout(checkCustomModel, 500);
    return () => clearTimeout(timer);
  }, [customModelInput]);

  // Filtrar modelos baseado na pesquisa
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return POPULAR_MODELS;
    const query = searchQuery.toLowerCase();
    return POPULAR_MODELS.filter(
      model =>
        model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query) ||
        model.description?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Progresso do download ativo
  const activeProgress = useMemo(() => {
    if (!downloadState.isDownloading || downloadState.currentModel !== activeModelTag) {
      return null;
    }
    return {
      percent: downloadState.progress.percent,
      downloaded: downloadState.progress.downloadedBytes,
      total: downloadState.progress.totalBytes,
      downloadedFormatted: downloadState.progress.downloadedFormatted,
      totalFormatted: downloadState.progress.totalFormatted,
      status: downloadState.progress.status,
      speed: downloadState.progress.speed,
    };
  }, [downloadState, activeModelTag]);

  // Atualizar lista de instalados e limpar activeModelTag quando download completar
  useEffect(() => {
    if (downloadState.isSuccess && activeModelTag) {
      const modelTag = activeModelTag;
      // Adicionar modelo à lista de instalados usando startTransition para evitar cascading renders
      startTransition(() => {
        setInstalledModels(prev => new Set([...prev, modelTag]));
        // Verificar também o modelo customizado se for o caso
        if (modelTag === customModelInput.trim()) {
          setCustomModelInstalled(true);
        }
      });
      // Limpar activeModelTag após um pequeno delay para garantir que o estado foi atualizado
      const timer = setTimeout(() => {
        setActiveModelTag(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [downloadState.isSuccess, activeModelTag, customModelInput]);

  // Verificar estado do setup quando download completar
  useEffect(() => {
    if (downloadState.isSuccess || (!downloadState.isDownloading && downloadState.progress.percent === 100 && downloadState.progress.status === 'success')) {
      checkSetupState().catch(console.error);
    }
  }, [downloadState.isSuccess, downloadState.isDownloading, downloadState.progress.percent, downloadState.progress.status, checkSetupState]);

  const handleModelDownload = useCallback(async (modelTag: string) => {
    if (downloadState.isDownloading) {
      console.warn('Download já em andamento');
      return;
    }
    
    setActiveModelTag(modelTag);
    try {
      await startDownload(modelTag);
    } catch (error) {
      console.error('Erro ao iniciar download:', error);
      setActiveModelTag(null);
    }
  }, [downloadState.isDownloading, startDownload]);

  const handleCustomDownload = useCallback(async () => {
    const modelTag = customModelInput.trim();
    if (!modelTag) return;
    
    await handleModelDownload(modelTag);
    setCustomModelInput('');
  }, [customModelInput, handleModelDownload]);

  if (state.modelDownloaded) {
    return (
      <Card className="w-full max-w-2xl mx-auto border-zinc-800 bg-zinc-950/50 backdrop-blur-sm shadow-2xl">
        <CardHeader className="p-6 sm:p-8">
          <CardTitle className="text-2xl font-bold text-white flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
            <span>Modelo Instalado</span>
          </CardTitle>
          <CardDescription className="text-zinc-400 mb-8 text-base">
            Modelo {state.modelName || 'padrão'} pronto para uso.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 sm:px-8 pb-6 sm:pb-8 pt-0 space-y-6">
           <div className="flex items-start sm:items-center gap-3 p-4 bg-emerald-950/30 rounded-lg border border-emerald-900/50">
             <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
             <div className="flex-1 min-w-0">
               <p className="text-sm font-medium text-emerald-100">Download concluído com sucesso!</p>
               <p className="text-xs text-emerald-300 mt-1">Avançando para o próximo passo...</p>
             </div>
           </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-6xl mx-auto border-zinc-800 bg-zinc-950/50 backdrop-blur-sm shadow-2xl max-h-[calc(100vh-20rem)] flex flex-col">
      <CardHeader className="p-6 sm:p-8 flex-shrink-0">
          <CardTitle className="text-xl font-bold text-white flex items-center gap-2 mb-1">
            <Download className="w-6 h-6 shrink-0" />
            <span>Download do Modelo</span>
          </CardTitle>
          <CardDescription className="text-zinc-400 text-xs">
            Escolha um modelo e/ou informe uma tag custom para baixar.
          </CardDescription>
      </CardHeader>
      
      <CardContent className="px-6 sm:px-8 pb-4 sm:pb-6 pt-0 space-y-4 flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col md:flex-row gap-3 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Pesquisar modelos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-sm"
            />
          </div>
          <div className="flex gap-2 md:w-1/3">
            <Input
              type="text"
              placeholder="Tag custom (ex: deepseek-coder:6.7b)"
              value={customModelInput}
              onChange={(e) => setCustomModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCustomDownload();
                }
              }}
              disabled={downloadState.isDownloading}
              className="flex-1 h-10 text-sm"
            />
            <Button
              onClick={handleCustomDownload}
              disabled={!customModelInput.trim() || downloadState.isDownloading || customModelInstalled}
              variant={customModelInstalled ? 'outline' : 'default'}
              className={cn(
                "gap-2 h-10 px-4 text-sm",
                customModelInstalled && "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
              )}
            >
              {downloadState.isDownloading && activeModelTag === customModelInput.trim() ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Baixando
                </>
              ) : customModelInstalled ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Já Instalado
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Baixar
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Lista de Modelos Recomendados */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mt-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-semibold">Modelos Recomendados</h3>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 min-h-[300px] max-h-[450px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 custom-scrollbar">
            {filteredModels.length === 0 ? (
              <div className="col-span-1 sm:col-span-2 text-center py-12 text-sm text-muted-foreground">
                Nenhum modelo encontrado para &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              filteredModels.map((model) => {
                const isActive = activeModelTag === model.id;
                const isDownloading = downloadState.isDownloading && isActive;
                const progress = isActive ? activeProgress : null;
                const isInstalled = installedModels.has(model.id);

                return (
                  <Card
                    key={model.id}
                    className={cn(
                      'relative border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 transition-all',
                      isDownloading && 'border-emerald-500/50',
                      isInstalled && !isDownloading && 'border-emerald-500/30 bg-emerald-500/5'
                    )}
                  >
                    <div className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm truncate">{model.name}</h4>
                            {isInstalled && (
                              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] px-1.5 py-0">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Instalado
                              </Badge>
                            )}
                          </div>
                          <p className="hidden md:block text-[11px] text-muted-foreground mt-1 line-clamp-1">
                            {model.description || ''}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px] sm:text-xs">
                          {model.size}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground gap-2">
                        <span className="truncate">Mín. {model.minRam}GB RAM</span>
                        <code className="text-[9px] sm:text-[10px] bg-muted px-1 sm:px-1.5 py-0.5 rounded shrink-0 truncate max-w-[120px] sm:max-w-none">
                          {model.id}
                        </code>
                      </div>

                      {isDownloading && progress && (
                        <div className="space-y-1 pt-2 border-t border-zinc-800/50">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {progress.status || 'Baixando...'}
                            </span>
                            {progress.speed && (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {progress.speed}
                              </span>
                            )}
                          </div>
                          <Progress
                            value={progress.total > 0 && progress.percent !== null ? progress.percent : undefined}
                            className="h-1"
                          />
                          {progress.total > 0 && (
                            <div className="flex justify-between text-[10px] text-muted-foreground/70">
                              <span>
                                {progress.downloadedFormatted} / {progress.totalFormatted}
                              </span>
                              <span>{progress.percent ?? 0}%</span>
                            </div>
                          )}
                        </div>
                      )}

                      <Button
                        onClick={() => handleModelDownload(model.id)}
                        disabled={downloadState.isDownloading || isInstalled}
                        variant={isInstalled ? 'outline' : isDownloading ? 'outline' : 'default'}
                        className={cn(
                          "w-full gap-2 h-8 text-xs",
                          isInstalled && "border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                        )}
                      >
                        {isDownloading ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span className="hidden sm:inline">Baixando...</span>
                          </>
                        ) : isInstalled ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            <span className="hidden sm:inline">Já Instalado</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3" />
                            <span className="hidden sm:inline">Baixar</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        {/* Mensagens de Erro */}
        {state.lastError && (
          <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900/50">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-900 dark:text-red-100">Erro no download</p>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1 break-words">{state.lastError}</p>
            </div>
          </div>
        )}

        {/* SLIM FOOTER NAVIGATION */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 mt-4 border-t border-zinc-800 bg-zinc-950/50 backdrop-blur-sm flex-shrink-0">
          <div className="text-xs text-zinc-500">
            <span>Selecione um modelo ou pule para configurar depois.</span>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Button
              variant="ghost"
              onClick={onNext}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800 flex-1 sm:flex-initial"
              disabled={downloadState.isDownloading}
            >
              Pular etapa
            </Button>
            <Button
              onClick={onNext}
              className="bg-white text-black hover:bg-zinc-200 px-8 flex-1 sm:flex-initial"
              disabled={downloadState.isDownloading}
            >
              Continuar <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-6 sm:p-8 pt-0 border-t-0 flex-shrink-0 hidden">
        {/* Footer vazio - mantido para compatibilidade, mas conteúdo movido para CardContent */}
      </CardFooter>
    </Card>
  );
}
