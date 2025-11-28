import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, Download, Loader2, Play } from "lucide-react";
import { RECOMMENDED_MODELS, ModelRecommendation } from "@/lib/recommendation";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { startTransition } from "react";

interface ModelSelectorProps {
  recommendation: ModelRecommendation;
  onComplete: () => void;
}

interface DownloadInfo {
  status: string;
  percent?: number;
  downloaded?: string;
  total?: string;
  speed?: string;
  raw: string;
}

export function ModelSelector({ recommendation, onComplete }: ModelSelectorProps) {
  const [selectedModelId, setSelectedModelId] = useState(recommendation.modelId);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  const selectedModel = RECOMMENDED_MODELS.find(m => m.id === selectedModelId) || RECOMMENDED_MODELS[0];

  useEffect(() => {
    checkInstallation(selectedModelId);
  }, [selectedModelId]);

  useEffect(() => {
    const unlisten = listen<string>('download-progress', (event) => {
      const payload = event.payload;
      
      // Tentar parsear como JSON estruturado
      let info: DownloadInfo | null = null;
      try {
        info = JSON.parse(payload) as DownloadInfo;
      } catch {
        // Fallback: tratar como string raw
        info = {
          status: "downloading",
          raw: payload,
        };
      }
      
      if (info) {
        setDownloadInfo(info);
        
        // Atualizar status text
        const statusText = info.status === "pulling" ? "Baixando modelo..." :
                         info.status === "verifying" ? "Verificando..." :
                         info.status === "writing" ? "Salvando..." :
                         info.status === "success" ? "Concluído!" :
                         "Baixando...";
        setDownloadStatus(statusText);
        
        // Atualizar progresso
        if (info.percent !== undefined) {
          setDownloadProgress(info.percent);
        } else {
          // Fallback: estimar progresso baseado no status
          if (info.status === "pulling") {
            setDownloadProgress(prev => prev < 10 ? 10 : prev);
          } else if (info.status === "verifying") {
            setDownloadProgress(90);
          } else if (info.status === "writing") {
            setDownloadProgress(95);
          }
        }
        
        // Se chegou a 100% ou success, marcar como instalado após um pequeno delay
        if (info.percent === 100 || info.status === "success") {
          setTimeout(async () => {
            setIsInstalled(true);
            setIsDownloading(false);
            // Verificar instalação de forma assíncrona sem bloquear
            checkInstallation(selectedModelId).catch(console.error);
          }, 500);
        }
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [selectedModelId]);

  const checkInstallation = async (modelId: string) => {
    try {
      const installed = await invoke<boolean>('check_if_model_installed', { name: modelId });
      setIsInstalled(installed);
    } catch (e) {
      console.error("Check failed", e);
    }
  };

  const handleNavigate = () => {
    setIsNavigating(true);
    // Usar startTransition para navegação não-bloqueante
    startTransition(() => {
      onComplete();
    });
  };

  const handleDownload = async () => {
    // Optimistic UI: atualizar estado imediatamente antes da chamada Tauri
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStatus("Iniciando download...");
    
    // Chamar Tauri em background (não bloquear)
    invoke('pull_model', { name: selectedModelId })
      .catch((error) => {
        console.error("Download failed", error);
        setDownloadStatus("Falha no download. Tente novamente.");
        setDownloadProgress(0);
        setIsDownloading(false);
      });
    // O status será atualizado pelo listener quando o download completar
    // Não precisamos aguardar aqui pois o listener já faz isso
  };

  return (
    <Card className="w-full max-w-md mx-auto mt-6 border-primary shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Escolha seu Modelo</CardTitle>
            <CardDescription>
              {selectedModelId === recommendation.modelId 
                ? "Baseado no seu hardware, recomendamos:" 
                : "Você selecionou um modelo personalizado:"}
            </CardDescription>
          </div>
          {selectedModelId === recommendation.modelId && (
            <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-100">
              Recomendado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select 
          value={selectedModelId} 
          onValueChange={setSelectedModelId}
          disabled={isDownloading}
        >
          <SelectTrigger className="w-full h-14 text-lg">
            <SelectValue placeholder="Selecione um modelo" />
          </SelectTrigger>
          <SelectContent>
            {RECOMMENDED_MODELS.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex flex-col items-start">
                  <span className="font-medium">{model.name}</span>
                  <span className="text-xs text-muted-foreground">{model.size} • Min RAM: {model.minRam}GB</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="bg-muted/50 p-4 rounded-md text-sm">
          <p className="font-medium mb-1">Sobre este modelo:</p>
          <p className="text-muted-foreground">
            {selectedModelId === recommendation.modelId 
              ? recommendation.reason 
              : "Modelo alternativo selecionado. Certifique-se de ter memória suficiente."}
          </p>
        </div>

        {isDownloading && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{downloadStatus || "Iniciando..."}</span>
              <span>{downloadProgress}%</span>
            </div>
            <Progress value={downloadProgress} className="h-2" />
            {downloadInfo && (downloadInfo.downloaded || downloadInfo.speed) && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {downloadInfo.downloaded && downloadInfo.total 
                    ? `${downloadInfo.downloaded} / ${downloadInfo.total}`
                    : downloadInfo.downloaded || ""}
                </span>
                {downloadInfo.speed && (
                  <span>{downloadInfo.speed}</span>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter>
        {isInstalled ? (
          <Button 
            className="w-full h-12 text-lg" 
            onClick={handleNavigate}
            disabled={isNavigating}
          >
            {isNavigating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Inicializando...
              </>
            ) : (
              <>
                Ir para o Chat
                <Play className="ml-2 w-5 h-5" />
              </>
            )}
          </Button>
        ) : (
          <Button 
            className="w-full h-12 text-lg" 
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Baixando...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Baixar e Instalar ({selectedModel.size})
              </>
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

