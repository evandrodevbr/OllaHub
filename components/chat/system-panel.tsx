import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Trash2, HardDrive, Cpu, Database, Upload, Globe } from "lucide-react";
import { useSystemMonitor } from "@/hooks/use-system-monitor";
import { useLocalModels } from "@/hooks/use-local-models";
import { useState } from "react";
import { ModelDownloadDialog } from "./model-download-dialog";

export function SystemPanel() {
  const stats = useSystemMonitor();
  const { models, deleteModel, refresh } = useLocalModels();
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);

  const ramUsagePercent = stats 
    ? (stats.memory_used / stats.memory_total) * 100 
    : 0;

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {/* Hardware Stats */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Monitoramento
        </h3>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="w-4 h-4" /> Processador
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between text-xs mb-1">
              <span>Uso</span>
              <span>{stats?.cpu_usage.toFixed(1)}%</span>
            </div>
            <Progress value={stats?.cpu_usage || 0} className="h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="w-4 h-4" /> Memória RAM
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between text-xs mb-1">
              <span>{stats ? formatBytes(stats.memory_used) : '-'}</span>
              <span>{stats ? formatBytes(stats.memory_total) : '-'}</span>
            </div>
            <Progress value={ramUsagePercent} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Models List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Modelos Instalados
          </h3>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowDownloadDialog(true)}
              className="h-6 text-xs"
            >
              <Upload className="w-3 h-3 mr-1" />
              Adicionar
            </Button>
            <Button variant="ghost" size="sm" onClick={refresh} className="h-6 text-xs">
              Atualizar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {models.map((model) => {
            // Tentar detectar se é modelo local/GGUF (heurística: modelos GGUF geralmente têm nomes específicos)
            // Por enquanto, vamos mostrar todos como disponíveis
            const isLocal = model.name.toLowerCase().includes('gguf') || 
                           model.name.toLowerCase().endsWith('.gguf');
            
            return (
              <Card key={model.id} className="overflow-hidden hover:bg-muted/50 transition-colors">
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-medium text-sm truncate" title={model.name}>
                        {model.name}
                      </div>
                      {isLocal && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                          <Upload className="w-2.5 h-2.5 mr-1" />
                          Local
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Database className="w-3 h-3" />
                      {model.size}
                    </div>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                          onClick={async () => {
                            if (confirm(`Tem certeza que deseja remover o modelo "${model.name}"?`)) {
                              try {
                                await deleteModel(model.name);
                              } catch (error) {
                                console.error('Erro ao remover modelo:', error);
                              }
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Remover modelo</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardContent>
              </Card>
            );
          })}
          {models.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8 space-y-2">
              <p>Nenhum modelo encontrado.</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowDownloadDialog(true)}
                className="mt-2"
              >
                <Upload className="w-4 h-4 mr-2" />
                Instalar Modelo
              </Button>
            </div>
          )}
        </div>
      </div>
      
      <ModelDownloadDialog
        open={showDownloadDialog}
        onOpenChange={setShowDownloadDialog}
        onSuccess={(modelName) => {
          refresh();
          setShowDownloadDialog(false);
        }}
      />
    </div>
  );
}



