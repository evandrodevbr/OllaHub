import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Loader2, X, Upload, Globe, AlertCircle, File } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
// Usar file dialog do Tauri v2

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
  const [activeTab, setActiveTab] = useState<"download" | "local">("download");
  const [modelName, setModelName] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const isDownloadingRef = useRef(false);
  const modelNameRef = useRef("");
  
  // Estados para instalação local
  const [isInstallingLocal, setIsInstallingLocal] = useState(false);
  const [localInstallProgress, setLocalInstallProgress] = useState(0);
  const [localInstallError, setLocalInstallError] = useState<string | null>(null);
  const [localModelName, setLocalModelName] = useState("");

  // Atualizar refs quando estado muda
  useEffect(() => {
    isDownloadingRef.current = isDownloading;
    modelNameRef.current = modelName;
  }, [isDownloading, modelName]);

  // Resetar estado quando dialog abre/fecha
  useEffect(() => {
    if (open) {
      setActiveTab("download");
      setModelName("");
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus("");
      setDownloadInfo(null);
      setError(null);
      setIsInstalled(false);
      isDownloadingRef.current = false;
      modelNameRef.current = "";
      // Reset estados locais
      setIsInstallingLocal(false);
      setLocalInstallProgress(0);
      setLocalInstallError(null);
      setLocalModelName("");
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

  const handleSelectFileButton = async () => {
    try {
      // Usar comando Rust para abrir dialog nativo do sistema
      // Isso evita limitações do input file HTML5 com arquivos grandes
      const selectedPath = await invoke<string | null>('open_gguf_file_dialog');
      
      if (!selectedPath) {
        // Usuário cancelou
        return;
      }
      
      setIsInstallingLocal(true);
      setLocalInstallError(null);
      setLocalInstallProgress(0);
      
      try {
        setLocalInstallProgress(10);
        
        // Extrair nome do arquivo do caminho
        const pathParts = selectedPath.split(/[/\\]/);
        const fileName = pathParts[pathParts.length - 1] || 'model';
        const fileNameLower = fileName.toLowerCase();
        const hasGgufExtension = fileNameLower.endsWith('.gguf');
        
        // Extrair nome do modelo (remover extensão se for .gguf, senão manter)
        const fileNameWithoutExt = hasGgufExtension 
          ? fileName.replace(/\.gguf$/i, '')
          : fileName;
        const modelNameToUse = localModelName.trim() || fileNameWithoutExt;
        
        setLocalInstallProgress(30);
        
        // Instalar diretamente do caminho (sem precisar copiar para temp primeiro)
        const installedModelName = await invoke<string>('install_gguf_model', {
          filePath: selectedPath,
          modelName: modelNameToUse || undefined,
        });
        
        setLocalInstallProgress(100);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (onSuccess) {
          onSuccess(installedModelName);
        }
        
        setTimeout(() => {
          onOpenChange(false);
        }, 1000);
        
      } catch (err: any) {
        const errorMsg = err?.message || 'Erro ao instalar modelo GGUF';
        setLocalInstallError(errorMsg);
        console.error('Erro ao instalar modelo GGUF:', err);
      } finally {
        setIsInstallingLocal(false);
      }
    } catch (err: any) {
      console.error('Erro ao abrir dialog de arquivo:', err);
      setLocalInstallError('Erro ao abrir seletor de arquivo');
    }
  };

  const isValid = modelName.trim().length > 0 && !validateModelName(modelName.trim());

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        handleClose();
      }
    }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Adicionar Modelo</DialogTitle>
          <DialogDescription>
            Baixe modelos do Ollama ou instale arquivos GGUF locais
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "download" | "local")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="download" className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Baixar do Ollama
            </TabsTrigger>
            <TabsTrigger value="local" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Instalar Local
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="download" className="space-y-4 mt-4">
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
          </TabsContent>
          
          <TabsContent value="local" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="local-model-name">Nome do Modelo (opcional)</Label>
                <Input
                  id="local-model-name"
                  value={localModelName}
                  onChange={(e) => setLocalModelName(e.target.value)}
                  placeholder="Deixe vazio para usar o nome do arquivo"
                  disabled={isInstallingLocal}
                />
                <p className="text-xs text-muted-foreground">
                  Se não especificar, o nome será extraído do arquivo
                </p>
              </div>
              
              <div className="space-y-4">
                {isInstallingLocal ? (
                  <div className="border rounded-xl p-6 bg-muted/30 space-y-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">Instalando modelo...</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Processando arquivo...
                        </p>
                      </div>
                    </div>
                    
                    {localInstallProgress > 0 && (
                      <div className="space-y-2">
                        <Progress value={localInstallProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground text-center">
                          {localInstallProgress}%
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="border-2 border-dashed rounded-xl p-8 text-center bg-muted/30">
                      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-4">
                        Selecione um arquivo GGUF para instalar localmente
                      </p>
                      <Button
                        onClick={handleSelectFileButton}
                        disabled={isInstallingLocal}
                        className="w-full"
                      >
                        <File className="w-4 h-4 mr-2" />
                        Selecionar arquivo GGUF
                      </Button>
                    </div>
                    
                    {localInstallError && (
                      <div className="border border-destructive/50 rounded-xl p-4 bg-destructive/5 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium text-sm text-destructive">Erro ao instalar modelo</p>
                            <p className="text-xs text-destructive/80 mt-1">{localInstallError}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              
              <div className="bg-muted/30 border border-border/50 rounded-lg p-3 text-xs text-muted-foreground">
                <p className="font-medium mb-1">ℹ️ Modelos instalados localmente</p>
                <p>Funcionam sem conexão à internet. O arquivo será copiado para o diretório do Ollama.</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isInstallingLocal}
          >
            <X className="mr-2 h-4 w-4" />
            Cancelar
          </Button>
          {activeTab === "download" && (
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
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

