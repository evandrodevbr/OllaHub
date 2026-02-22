'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Search, DownloadCloud, Cpu, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useModelSelection } from '@/hooks/use-model-selection';
import { useDownloadContext } from '@/contexts/download-context';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export function ModelSelector() {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const { myModels, availableModels, selectedModel, setSelectedModel, installedVariantsByFamily, refreshModels } = useModelSelection();
  const { startDownload, state: downloadState } = useDownloadContext();
  const { toast } = useToast();

  // Track selected variant for each model in the catalog
  const [selectedVariants, setSelectedVariants] = React.useState<Record<string, string>>({});

  const handleDownload = async (e: React.MouseEvent, modelName: string) => {
    e.stopPropagation();
    try {
      await startDownload(modelName);
      toast({
        title: "Download Iniciado",
        description: `Baixando ${modelName}...`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao iniciar download.",
        variant: "destructive",
      });
    }
  };

  const handleSmartDownload = async () => {
    const term = searchQuery.trim();
    if (!term) return;
    
    try {
      await startDownload(term);
      setOpen(false);
      setSearchQuery("");
      toast({
        title: "Download Iniciado",
        description: `Baixando ${term} da biblioteca Ollama...`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao iniciar download.",
        variant: "destructive",
      });
    }
  };

  React.useEffect(() => {
    if (downloadState?.isSuccess) {
      refreshModels();
    }
  }, [downloadState?.isSuccess, refreshModels]);

  const filteredMyModels = React.useMemo(() => {
    if (!searchQuery) return myModels;
    return myModels.filter(m => 
      m.model.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [myModels, searchQuery]);

  const filteredAvailableModels = React.useMemo(() => {
    if (!searchQuery) return availableModels;
    return availableModels.filter(m => 
      m.model.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [availableModels, searchQuery]);

  // Helper to check if a model is currently selected (partial match for variants)
  const isSelected = (modelName: string) => {
    if (!selectedModel) return false;
    return selectedModel.startsWith(modelName) || selectedModel === modelName;
  };

  // Helper to extract tag/parameters from model name
  const getVariantDisplay = (name: string) => {
    if (name.includes(':')) {
      return name.split(':')[1];
    }
    return 'latest';
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[260px] justify-between"
        >
          {selectedModel ? (
            <span className="flex items-center gap-2 truncate">
               <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />
               <span className="truncate">{selectedModel}</span>
            </span>
          ) : (
            "Selecione um modelo..."
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="flex flex-col">
            {/* Search Input */}
            <div className="flex items-center border-b border-border/50 px-3 bg-muted/30">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                    className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Buscar modelos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchQuery && filteredAvailableModels.length === 0) {
                            handleSmartDownload();
                        }
                    }}
                />
            </div>
            
            <Tabs defaultValue="installed" className="w-full">
                <TabsList className="w-full rounded-none border-b bg-transparent p-0">
                    <TabsTrigger 
                        value="installed" 
                        className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-10"
                    >
                        Instalados
                    </TabsTrigger>
                    <TabsTrigger 
                        value="available" 
                        className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-10"
                    >
                        Catálogo
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="installed" className="m-0 max-h-[400px] overflow-y-auto p-2">
                    {filteredMyModels.length === 0 ? (
                         <div className="py-8 text-center text-sm text-muted-foreground">
                            {searchQuery ? (
                                <span>Nenhum modelo instalado encontrado.</span>
                            ) : (
                                <span>Nenhum modelo instalado.</span>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {filteredMyModels.map((modelDef) => {
                                const family = modelDef.model;
                                const installedTags = installedVariantsByFamily[family] || [];
                                const isFamilySelected = selectedModel ? (selectedModel === family || selectedModel.startsWith(family + ":")) : false;

                                return (
                                    <div
                                        key={family}
                                        className="relative flex flex-col rounded-md border border-transparent hover:border-border/50 bg-card/50 hover:bg-accent/30 p-3 text-sm transition-all"
                                    >
                                        <div className="flex items-start justify-between w-full mb-2">
                                            <div className="flex flex-col gap-0.5 overflow-hidden pr-2">
                                                <span className="font-bold text-base truncate flex items-center gap-2">
                                                    {modelDef.model}
                                                    {isFamilySelected && (
                                                        <Check className="h-3 w-3 text-primary animate-in fade-in zoom-in" />
                                                    )}
                                                </span>
                                                <span className="text-xs text-muted-foreground line-clamp-2" title={modelDef.description}>
                                                    {modelDef.description}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {installedTags.map((fullTag) => {
                                                const tag = getVariantDisplay(fullTag);
                                                const isExactSelected = selectedModel === fullTag;
                                                // Find variant def for size info if available
                                                const variantDef = modelDef.variants.find(v => v.name === fullTag);
                                                
                                                return (
                                                    <Badge
                                                        key={fullTag}
                                                        variant="outline"
                                                        className={cn(
                                                            "cursor-pointer text-[10px] px-2 h-5 transition-all border-transparent",
                                                            isExactSelected 
                                                                ? "bg-foreground text-background hover:bg-foreground/90" 
                                                                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                                        )}
                                                        title={variantDef ? `Tamanho: ${variantDef.size}` : undefined}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedModel(fullTag);
                                                            setOpen(false);
                                                        }}
                                                    >
                                                        {tag}
                                                    </Badge>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="available" className="m-0 max-h-[400px] overflow-y-auto p-2">
                     {filteredAvailableModels.length === 0 ? (
                         <div className="py-6 text-center text-sm">
                             {searchQuery ? (
                                <div className="flex flex-col items-center gap-2">
                                  <p className="text-muted-foreground">Modelo não encontrado no catálogo.</p>
                                  <Button 
                                    variant="outline" 
                                    className="h-auto py-2 px-4 border-dashed border-zinc-500/50 hover:border-primary hover:bg-primary/10"
                                    onClick={handleSmartDownload}
                                  >
                                    <DownloadCloud className="mr-2 h-4 w-4" />
                                    <span>Baixar <span className="font-bold ml-1">{searchQuery}</span></span>
                                  </Button>
                                </div>
                             ) : (
                                <span className="text-muted-foreground">Nenhum modelo encontrado.</span>
                             )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                             {filteredAvailableModels.map((modelDef) => {
                                // Determine active variant for this item
                                const activeVariantName = selectedVariants[modelDef.model] || modelDef.variants[0]?.name;
                                const activeVariant = modelDef.variants.find(v => v.name === activeVariantName) || modelDef.variants[0];

                                return (
                                <div
                                    key={modelDef.model}
                                    className="relative flex flex-col rounded-md border border-transparent hover:border-border/50 bg-card/50 hover:bg-accent/30 p-3 text-sm transition-all"
                                >
                                    <div className="flex items-start justify-between w-full mb-2">
                                        <div className="flex flex-col gap-0.5 overflow-hidden pr-2">
                                            <span className="font-bold text-base truncate">{modelDef.model}</span>
                                            <span className="text-xs text-muted-foreground line-clamp-2" title={modelDef.description}>
                                                {modelDef.description}
                                            </span>
                                        </div>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                            onClick={(e) => handleDownload(e, activeVariant.name)}
                                            disabled={downloadState.isDownloading && downloadState.currentModel === activeVariant.name}
                                            title={`Baixar ${activeVariant.name}`}
                                        >
                                            {downloadState.isDownloading && downloadState.currentModel === activeVariant.name ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <DownloadCloud className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>

                                    {/* Variants Pills */}
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {modelDef.variants.map((variant) => {
                                            const isVariantSelected = activeVariant.name === variant.name;
                                            return (
                                                <Badge 
                                                    key={variant.name} 
                                                    variant="outline"
                                                    className={cn(
                                                        "cursor-pointer text-[10px] px-2 h-5 transition-all border-transparent",
                                                        isVariantSelected 
                                                            ? "bg-foreground text-background hover:bg-foreground/90" 
                                                            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                                    )}
                                                    title={`Tamanho em disco: ${variant.size}`}
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        setSelectedVariants(prev => ({
                                                            ...prev,
                                                            [modelDef.model]: variant.name
                                                        }));
                                                    }} 
                                                >
                                                    {getVariantDisplay(variant.name)}
                                                </Badge>
                                            );
                                        })}
                                    </div>
                                </div>
                            )})}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
      </PopoverContent>
    </Popover>
  );
}
