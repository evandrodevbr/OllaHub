import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Download, Loader2, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface ModelDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (modelName: string) => void;
}

interface DownloadInfo {
  status: string;
  percent?: number;
  downloaded?: string;
  total?: string;
  speed?: string;
  raw: string;
}

export function ModelDownloadDialog({ open, onOpenChange, onSuccess }: ModelDownloadDialogProps) {
  const [modelName, setModelName] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const isDownloadingRef = useRef(false);
  const modelNameRef = useRef("");

  // Atualizar refs quando estado muda
  useEffect(() => {
    isDownloadingRef.current = isDownloading;
    modelNameRef.current = modelName;
  }, [isDownloading, modelName]);

  // Resetar estado quando dialog abre/fecha
  useEffect(() => {
    if (open) {
      setModelName("");
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus("");
      setDownloadInfo(null);
      setError(null);
      setIsInstalled(false);
      isDownloadingRef.current = false;
      modelNameRef.current = "";
    }
  }, [open]);

  // Verificar se modelo já está instalado quando nome muda
  useEffect(() => {
    if (modelName.trim() && !isDownloading) {
      checkInstallation(modelName.trim());
    }
  }, [modelName, isDownloading]);

  // Listener para progresso do download - sempre ativo quando dialog está aberto
  useEffect(() => {
    if (!open) return;

    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      const unlisten = await listen<string>('download-progress', (event) => {
        // Só processar se estiver fazendo download (usar ref para evitar stale closure)
        if (!isDownloadingRef.current) return;

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
              isDownloadingRef.current = false;
              const currentModelName = modelNameRef.current.trim();
              await checkInstallation(currentModelName);
              // Após verificar instalação, chamar onSuccess e fechar
              if (onSuccess) {
                onSuccess(currentModelName);
              }
              onOpenChange(false);
            }, 500);
          }
        }
      });
      unlistenFn = unlisten;
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [open, onSuccess, onOpenChange]);

  const checkInstallation = async (name: string) => {
    try {
      const installed = await invoke<boolean>('check_if_model_installed', { name });
      setIsInstalled(installed);
      if (installed) {
        setError(null);
      }
    } catch (e) {
      console.error("Check failed", e);
    }
  };

  const validateModelName = (name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      return "Nome do modelo não pode estar vazio";
    }
    // Validar formato: aceita letras, números, pontos, underscores, hífens, dois pontos e barras
    // Exemplos válidos: "llama3.2:1b", "huihui_ai/qwen3-abliterated:1.7b", "mistral:latest"
    if (!/^[a-zA-Z0-9._:\/-]+$/.test(trimmed)) {
      return "Nome do modelo contém caracteres inválidos";
    }
    // Não pode começar ou terminar com barra, dois pontos ou hífen
    if (/^[\/:\-]|[\/:\-]$/.test(trimmed)) {
      return "Nome do modelo não pode começar ou terminar com /, : ou -";
    }
    return null;
  };

  const handleDownload = async () => {
    const trimmedName = modelName.trim();
    const validationError = validateModelName(trimmedName);
    
    if (validationError) {
      setError(validationError);
      return;
    }

    if (isInstalled) {
      // Se já está instalado, apenas fechar e notificar sucesso
      handleSuccess(trimmedName);
      return;
    }

    setIsDownloading(true);
    isDownloadingRef.current = true;
    setDownloadProgress(0);
    setDownloadStatus("Iniciando download...");
    setError(null);
    modelNameRef.current = trimmedName;

    try {
      await invoke('pull_model', { name: trimmedName });
      // O status será atualizado pelo listener quando o download completar
    } catch (error: any) {
      console.error("Download failed", error);
      setError(error?.message || "Falha no download. Tente novamente.");
      setDownloadStatus("");
      setDownloadProgress(0);
      setIsDownloading(false);
      isDownloadingRef.current = false;
    }
  };

  const handleSuccess = (name: string) => {
    // Só fechar e chamar onSuccess se realmente completou o download
    // Se já estava instalado, também chamar onSuccess
    if (onSuccess) {
      onSuccess(name);
    }
    // Não fechar automaticamente se foi apenas verificação de instalação
    // Deixar o usuário decidir quando fechar
  };

  const handleClose = () => {
    // Permitir fechar sempre, mas avisar se estiver baixando
    if (isDownloading) {
      const confirmed = window.confirm("O download está em andamento. Deseja realmente fechar? O download continuará em segundo plano.");
      if (!confirmed) {
        return;
      }
    }
    onOpenChange(false);
  };

  const handleCancel = () => {
    // Cancelar download (por enquanto apenas fecha o dialog e para o estado)
    // TODO: Implementar cancelamento real do processo ollama pull
    if (isDownloading) {
      const confirmed = window.confirm("Deseja cancelar o download? O processo continuará em segundo plano.");
      if (confirmed) {
        setIsDownloading(false);
        isDownloadingRef.current = false;
        setDownloadProgress(0);
        setDownloadStatus("");
        onOpenChange(false);
      }
    } else {
      onOpenChange(false);
    }
  };

  const isValid = modelName.trim().length > 0 && !validateModelName(modelName.trim());

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        handleClose();
      }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Adicionar Modelo</DialogTitle>
          <DialogDescription>
            Digite o nome do modelo do Ollama que deseja baixar (ex: llama3.2:1b, mistral:latest)
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="model-name">Nome do Modelo</Label>
            <Input
              id="model-name"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="ex: llama3.2:1b"
              disabled={isDownloading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isValid && !isDownloading) {
                  handleDownload();
                }
              }}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            {isInstalled && !isDownloading && (
              <p className="text-sm text-green-600 dark:text-green-400">
                ✓ Este modelo já está instalado
              </p>
            )}
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

          {isInstalled && !isDownloading && (
            <div className="bg-muted/50 p-3 rounded-md text-sm">
              <p className="text-muted-foreground">
                O modelo está instalado e pronto para uso.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
          >
            {isDownloading ? (
              <>
                <X className="mr-2 h-4 w-4" />
                Cancelar Download
              </>
            ) : (
              <>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </>
            )}
          </Button>
          <Button
            onClick={() => {
              if (isInstalled && !isDownloading) {
                handleSuccess(modelName.trim());
                onOpenChange(false);
              } else {
                handleDownload();
              }
            }}
            disabled={!isValid || isDownloading}
          >
            {isDownloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Baixando...
              </>
            ) : isInstalled ? (
              <>
                Usar Modelo
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Baixar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

