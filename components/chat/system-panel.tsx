import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Trash2, HardDrive, Cpu, Database } from "lucide-react";
import { useSystemMonitor } from "@/hooks/use-system-monitor";
import { useLocalModels } from "@/hooks/use-local-models";

export function SystemPanel() {
  const stats = useSystemMonitor();
  const { models, deleteModel, refresh } = useLocalModels();

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
          <Button variant="ghost" size="sm" onClick={refresh} className="h-6 text-xs">
            Atualizar
          </Button>
        </div>

        <div className="space-y-2">
          {models.map((model) => (
            <Card key={model.id} className="overflow-hidden">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate" title={model.name}>
                    {model.name}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <Database className="w-3 h-3" />
                    {model.size}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => deleteModel(model.name)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {models.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">
              Nenhum modelo encontrado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

