'use client';

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Download, Loader2, AlertCircle, CheckCircle2, Play } from "lucide-react"
import { useOllamaDownload } from "@/hooks/use-ollama-download"
import { useToast } from "@/hooks/use-toast"
import { useOperatingSystem } from "@/hooks/use-operating-system"
import type { OS } from "@/lib/download-utils"

interface InstallModalProps {
  open: boolean;
  onCheckAgain: () => void;
}

export function InstallModal({ open, onCheckAgain }: InstallModalProps) {
  const { os: detectedOS } = useOperatingSystem();
  const [activeTab, setActiveTab] = useState<OS>('mac');
  const downloadState = useOllamaDownload();
  const { toast } = useToast();

  // Detectar OS e definir aba ativa quando modal abrir
  useEffect(() => {
    if (open && detectedOS) {
      setActiveTab(detectedOS);
    }
  }, [open, detectedOS]);

  // Resetar estado quando o modal abrir
  useEffect(() => {
    if (open) {
      downloadState.reset();
      // Verificar se já existe download para a tab ativa
      downloadState.checkExistingDownload(activeTab);
    } else {
      // Parar verificação automática quando modal fechar
      downloadState.stopAutoCheck();
    }
  }, [open, activeTab]);

  // Verificar download existente ao mudar de tab
  useEffect(() => {
    if (open) {
      downloadState.checkExistingDownload(activeTab);
    }
  }, [activeTab, open]);

  // Escutar evento de Ollama instalado
  useEffect(() => {
    if (!open) return;

    const handleOllamaInstalled = () => {
      // Ollama foi encontrado, verificar novamente para atualizar o estado
      onCheckAgain();
    };

    window.addEventListener('ollama-installed', handleOllamaInstalled);
    return () => {
      window.removeEventListener('ollama-installed', handleOllamaInstalled);
    };
  }, [open, onCheckAgain]);

  // Mostrar toast quando houver erro
  useEffect(() => {
    if (downloadState.downloadError) {
      toast({
        title: 'Erro no download',
        description: downloadState.downloadError,
        variant: 'destructive',
      });
    }
  }, [downloadState.downloadError, toast]);

  const handleDownload = async (os: OS) => {
    await downloadState.handleDownload(os);
  };

  const handleInstall = async () => {
    try {
      await downloadState.handleInstall();
      // Toast será mostrado automaticamente via eventos de progresso
    } catch (error) {
      toast({
        title: 'Erro ao executar instalador',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  const DownloadButton = ({ os, label }: { os: OS; label: string }) => {
    const isActive = activeTab === os;
    const isDownloading = downloadState.isDownloading && isActive;
    const hasDownloaded = downloadState.filePath !== null && isActive;

    if (hasDownloaded && !isDownloading) {
      return (
        <Button 
          variant="default" 
          className="w-full" 
          onClick={handleInstall}
        >
          <Play className="mr-2 h-4 w-4" />
          Instalar Ollama
        </Button>
      );
    }

    return (
      <Button 
        variant="outline" 
        className="w-full" 
        onClick={() => handleDownload(os)}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {downloadState.downloadStatus || 'Baixando...'}
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            {label}
          </>
        )}
      </Button>
    );
  };

  const DownloadProgress = ({ os }: { os: OS }) => {
    const isActive = activeTab === os;
    const isDownloading = downloadState.isDownloading && isActive;
    const hasDownloaded = downloadState.filePath !== null && isActive;
    const isInstalling = downloadState.isInstalling && isActive;
    const installStatus = downloadState.installStatus;

    if (!isDownloading && !hasDownloaded && !isInstalling) {
      return null;
    }

    return (
      <div className="space-y-2">
        {isDownloading && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {downloadState.downloadStatus || 'Baixando...'}
              </span>
              <span className="font-medium">{downloadState.downloadProgress}%</span>
            </div>
            <Progress value={downloadState.downloadProgress} className="h-2" />
          </>
        )}
        {isInstalling && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {installStatus || 'Instalando...'}
              </span>
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
            <Progress value={undefined} className="h-2" />
          </>
        )}
        {hasDownloaded && !isDownloading && !isInstalling && (
          <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-md">
            <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 dark:text-green-400" />
            <div className="text-sm flex-1">
              <p className="font-medium text-green-900 dark:text-green-100">
                Download concluído
              </p>
              <p className="text-green-700 dark:text-green-300">
                Clique em "Instalar Ollama" para iniciar a instalação automática.
              </p>
            </div>
          </div>
        )}
        {downloadState.isInstalled && !isInstalling && (
          <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-md">
            <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 dark:text-green-400" />
            <div className="text-sm flex-1">
              <p className="font-medium text-green-900 dark:text-green-100">
                Instalação concluída!
              </p>
              <p className="text-green-700 dark:text-green-300">
                {installStatus || 'Ollama foi instalado com sucesso.'}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle data-tauri-drag-region className="cursor-move select-none">
            Ollama não encontrado
          </DialogTitle>
          <DialogDescription>
            Para usar o OllaHub, você precisa ter o Ollama instalado no seu sistema.
            Baixe e instale o Ollama usando os passos abaixo.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as OS)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="mac">macOS</TabsTrigger>
            <TabsTrigger value="linux">Linux</TabsTrigger>
            <TabsTrigger value="windows">Windows</TabsTrigger>
          </TabsList>
          
          <TabsContent value="mac" className="space-y-4 py-4">
            <div className="space-y-2">
              <h3 className="font-medium">1. Download e Instalação</h3>
              <DownloadButton os="mac" label="Baixar para macOS" />
              <DownloadProgress os="mac" />
            </div>
            {downloadState.downloadError && activeTab === 'mac' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
                <AlertCircle className="h-4 w-4 mt-0.5 text-red-600 dark:text-red-400" />
                <div className="text-sm">
                  <p className="font-medium text-red-900 dark:text-red-100">Erro no download</p>
                  <p className="text-red-700 dark:text-red-300">
                    {downloadState.downloadError}
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Após instalar, o Ollama será iniciado automaticamente. Se necessário, abra o terminal e digite <code className="bg-muted px-1 rounded">ollama serve</code>.</p>
              <p className="font-medium text-foreground">
                💡 Dica: Após concluir a instalação, você pode fechar qualquer janela de chat aberta pelo Ollama e continuar aqui no OllaHub.
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="linux" className="space-y-4 py-4">
            <div className="space-y-2">
              <h3 className="font-medium">Instalação via Terminal</h3>
              <div className="bg-muted p-4 rounded-md relative group">
                <code className="text-sm break-all">curl -fsSL https://ollama.com/install.sh | sh</code>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">Ou baixar e instalar via interface</h3>
              <DownloadButton os="linux" label="Baixar Script de Instalação" />
              <DownloadProgress os="linux" />
            </div>
            {downloadState.downloadError && activeTab === 'linux' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
                <AlertCircle className="h-4 w-4 mt-0.5 text-red-600 dark:text-red-400" />
                <div className="text-sm">
                  <p className="font-medium text-red-900 dark:text-red-100">Erro no download</p>
                  <p className="text-red-700 dark:text-red-300">
                    {downloadState.downloadError}
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <h3 className="font-medium">Comando Manual</h3>
              <div className="text-sm text-muted-foreground">
                Ou consulte <a href="https://ollama.com/download/linux" className="underline text-primary" target="_blank" rel="noopener noreferrer">ollama.com/download/linux</a> para instruções manuais.
              </div>
              <p className="text-sm font-medium text-foreground">
                💡 Dica: Após concluir a instalação, você pode fechar qualquer janela de chat aberta pelo Ollama e continuar aqui no OllaHub.
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="windows" className="space-y-4 py-4">
            <div className="space-y-2">
              <h3 className="font-medium">1. Download do Instalador</h3>
              <DownloadButton os="windows" label="Baixar para Windows" />
              <DownloadProgress os="windows" />
            </div>
            {downloadState.downloadError && activeTab === 'windows' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
                <AlertCircle className="h-4 w-4 mt-0.5 text-red-600 dark:text-red-400" />
                <div className="text-sm">
                  <p className="font-medium text-red-900 dark:text-red-100">Erro no download</p>
                  <p className="text-red-700 dark:text-red-300">
                    {downloadState.downloadError}
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Após clicar em "Instalar Ollama", o instalador será aberto. Siga as instruções na tela para completar a instalação.</p>
              <p className="font-medium text-foreground">
                💡 Dica: Após concluir a instalação, você pode fechar qualquer janela de chat aberta pelo Ollama e continuar aqui no OllaHub.
              </p>
            </div>
          </TabsContent>
        </Tabs>
        
        {/* Status de verificação automática */}
        {downloadState.isChecking && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md mt-4">
            <Loader2 className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 animate-spin" />
            <div className="text-sm flex-1">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Verificando instalação do Ollama...
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                {downloadState.checkStatus || 'Aguardando instalação ser concluída...'}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Esta verificação continuará em segundo plano até encontrar o Ollama.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
            <Button 
              onClick={() => {
                // Chamar verificação completa (instalação + execução)
                onCheckAgain();
              }}
            >
              Verificar Novamente
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
