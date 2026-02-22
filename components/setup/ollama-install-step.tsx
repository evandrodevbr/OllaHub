'use client';

import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useSetupWizard } from '@/hooks/use-setup-wizard';
import { useOllamaDownload } from '@/hooks/use-ollama-download';
import { useOllamaCheck } from '@/hooks/use-ollama-check';
import { useOperatingSystem } from '@/hooks/use-operating-system';
import { InstallationTerminal } from './installation-terminal';
import { Loader2, CheckCircle2, AlertCircle, Download, RefreshCw, Shield, Clock, WifiOff, ArrowRight } from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

type InstallErrorType = 'ERR_NO_PRIVILEGE' | 'ERR_DOWNLOAD_FAIL' | 'ERR_TIMEOUT' | 'ERR_INSTALL_FAILED';

function parseInstallError(error: string): InstallErrorType {
  const errorLower = error.toLowerCase();
  
  // Verificar privilégios/permissões
  if (
    errorLower.includes('privilege') ||
    errorLower.includes('permission') ||
    errorLower.includes('elevated') ||
    errorLower.includes('uac') ||
    errorLower.includes('administrator') ||
    errorLower.includes('access denied') ||
    errorLower.includes('acesso negado')
  ) {
    return 'ERR_NO_PRIVILEGE';
  }
  
  // Verificar erros de download/rede
  if (
    errorLower.includes('download') ||
    errorLower.includes('network') ||
    errorLower.includes('connection') ||
    errorLower.includes('failed to download') ||
    errorLower.includes('falha ao baixar') ||
    errorLower.includes('conexão') ||
    errorLower.includes('timeout') && (errorLower.includes('download') || errorLower.includes('conexão'))
  ) {
    return 'ERR_DOWNLOAD_FAIL';
  }
  
  // Verificar timeout
  if (
    errorLower.includes('timeout') ||
    errorLower.includes('90 segundos') ||
    errorLower.includes('timed out') ||
    errorLower.includes('tempo esgotado')
  ) {
    return 'ERR_TIMEOUT';
  }
  
  return 'ERR_INSTALL_FAILED';
}

interface ErrorDisplayProps {
  errorType: InstallErrorType;
  errorMessage: string;
  onRetry: () => void;
  isRetrying: boolean;
}

function ErrorDisplay({ errorType, errorMessage, onRetry, isRetrying }: ErrorDisplayProps) {
  switch (errorType) {
    case 'ERR_NO_PRIVILEGE':
      return (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex items-start gap-2 sm:gap-3">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm sm:text-base text-amber-900 dark:text-amber-100">
                  Permissões Administrativas Necessárias
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-amber-700 dark:text-amber-300 mt-1 sm:mt-2">
                  O Windows solicitou permissões de administrador para instalar o Ollama.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="bg-white dark:bg-zinc-900 p-3 sm:p-4 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-xs sm:text-sm font-medium text-foreground mb-2">O que fazer:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs sm:text-sm text-muted-foreground">
                <li>Verifique se apareceu um prompt do Windows pedindo permissões</li>
                <li>Clique em &quot;Sim&quot; ou &quot;Allow&quot; no prompt de UAC (User Account Control)</li>
                <li>Aguarde alguns segundos para a instalação continuar</li>
                <li>Se o prompt não apareceu, tente executar o OllaHub como administrador</li>
              </ol>
            </div>
            <Button 
              onClick={onRetry} 
              disabled={isRetrying}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Verificar Novamente
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {errorMessage}
            </p>
          </CardContent>
        </Card>
      );
      
    case 'ERR_DOWNLOAD_FAIL':
      return (
        <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex items-start gap-2 sm:gap-3">
              <WifiOff className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm sm:text-base text-red-900 dark:text-red-100">
                  Erro ao Baixar Instalador
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-red-700 dark:text-red-300 mt-1 sm:mt-2">
                  Não foi possível baixar o instalador do Ollama. Verifique sua conexão com a internet.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="bg-white dark:bg-zinc-900 p-3 sm:p-4 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-xs sm:text-sm text-muted-foreground break-words">
                {errorMessage}
              </p>
            </div>
            <Button 
              onClick={onRetry} 
              disabled={isRetrying}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Tentando Novamente...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Tentar Novamente
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      );
      
    case 'ERR_TIMEOUT':
      return (
        <Card className="border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20">
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex items-start gap-2 sm:gap-3">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm sm:text-base text-orange-900 dark:text-orange-100">
                  Instalação Demorando Mais do Que o Esperado
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-orange-700 dark:text-orange-300 mt-1 sm:mt-2">
                  A instalação pode ainda estar em andamento em segundo plano.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="bg-white dark:bg-zinc-900 p-3 sm:p-4 rounded-lg border border-orange-200 dark:border-orange-800">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2 break-words">
                O processo de instalação pode levar alguns minutos. Se o Ollama estiver sendo instalado, 
                você pode verificar o status manualmente.
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground break-words">
                {errorMessage}
              </p>
            </div>
            <Button 
              onClick={onRetry} 
              disabled={isRetrying}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Verificar Novamente
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      );
      
    default:
      return (
        <div className="flex items-start gap-2 p-3 sm:p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2 sm:space-y-3 min-w-0">
            <div>
              <p className="text-sm sm:text-base font-medium text-red-900 dark:text-red-100">Erro na instalação</p>
              <p className="text-xs sm:text-sm text-red-700 dark:text-red-300 mt-1 break-words">{errorMessage}</p>
            </div>
            <Button 
              onClick={onRetry} 
              disabled={isRetrying}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Verificar Novamente
                </>
              )}
            </Button>
          </div>
        </div>
      );
  }
}

type InstallStepState = 'IDLE' | 'INSTALLING' | 'VERIFYING' | 'SUCCESS';

interface OllamaInstallStepProps {
  onNext: () => void;
}

export function OllamaInstallStep({ onNext }: OllamaInstallStepProps) {
  const { state, installOllama, checkChocolatey, installChocolatey, installOllamaViaChoco, checkSetupState } = useSetupWizard();
  const { os: detectedOS } = useOperatingSystem();
  const downloadState = useOllamaDownload();
  const ollamaCheck = useOllamaCheck();
  const [stepState, setStepState] = useState<InstallStepState>('IDLE');
  const [useChocolatey, setUseChocolatey] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  
  const installationInProgressRef = useRef(false);
  const hasCheckedInitialRef = useRef(false);

  // Função de polling ativo para aguardar serviço ficar disponível
  const waitForService = async (maxAttempts = 15): Promise<boolean> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const isIntact = await invoke<boolean>('verify_ollama_integrity_command');
        if (isIntact) {
          return true;
        }
      } catch (error) {
        console.warn(`Tentativa ${attempt}/${maxAttempts} falhou:`, error);
      }
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    throw new Error('Ollama não ficou disponível após 30 segundos');
  };

  // Verificação inicial no mount: se Ollama já estiver instalado, ir direto para SUCCESS
  useEffect(() => {
    if (hasCheckedInitialRef.current) return;
    
    const checkInitial = async () => {
      if (stepState === 'IDLE') {
        try {
          const isIntact = await invoke<boolean>('verify_ollama_integrity_command');
          if (isIntact) {
            // Se a integridade está OK, atualizar estado do wizard e ir para SUCCESS
            await checkSetupState();
            setStepState('SUCCESS');
          }
        } catch {
          // Silenciosamente ignorar - usuário ainda não instalou
        }
      }
      hasCheckedInitialRef.current = true;
    };
    
    checkInitial();
  }, [stepState, checkSetupState]);

  // Sincronizar estado do polling com wizard state e atualizar FSM
  useEffect(() => {
    if (ollamaCheck.status === 'running' && !state.ollamaRunning) {
      // Polling detectou que Ollama está rodando, atualizar wizard state
      checkSetupState().catch(console.error);
    }
    
    // Atualizar FSM baseado no status
    if (stepState === 'VERIFYING' && ollamaCheck.status === 'running' && state.ollamaInstalled && state.ollamaRunning) {
      setStepState('SUCCESS');
      ollamaCheck.stopPolling();
    }
  }, [ollamaCheck.status, state.ollamaRunning, state.ollamaInstalled, checkSetupState, stepState, ollamaCheck]);

  const handleManualRetry = async () => {
    setIsRetrying(true);
    try {
      await checkSetupState();
      
      // Se já estiver instalado, ir para SUCCESS
      if (state.ollamaInstalled && state.ollamaRunning) {
        setStepState('SUCCESS');
      } else {
        // Iniciar verificação manual
        setStepState('VERIFYING');
        ollamaCheck.startPolling();
      }
    } catch (error) {
      console.error('Erro ao verificar novamente:', error);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCheckExisting = async () => {
    setStepState('VERIFYING');
    ollamaCheck.startPolling();
    await checkSetupState();
  };

  const handleInstall = async () => {
    if (installationInProgressRef.current) {
      return; // Evitar múltiplas instalações simultâneas
    }

    installationInProgressRef.current = true;
    setStepState('INSTALLING');
    setShowTerminal(true);
    
    try {
      // No Windows, verificar se Chocolatey está disponível
      if (detectedOS === 'windows') {
        const hasChoco = await checkChocolatey();
        if (hasChoco) {
          setUseChocolatey(true);
          // Instalar Ollama via Chocolatey
          await installOllamaViaChoco();
          // Após instalação, fazer polling ativo
          setStepState('VERIFYING');
          await waitForService(15); // 15 tentativas = 30 segundos
          // Se chegou aqui, Ollama está funcional
          setStepState('SUCCESS');
          await checkSetupState(); // Atualizar estado do wizard
          installationInProgressRef.current = false;
          return;
        } else {
          // Tentar instalar Chocolatey primeiro
          try {
            await installChocolatey();
            setUseChocolatey(true);
            await installOllamaViaChoco();
            // Após instalação, fazer polling ativo
            setStepState('VERIFYING');
            await waitForService(15); // 15 tentativas = 30 segundos
            // Se chegou aqui, Ollama está funcional
            setStepState('SUCCESS');
            await checkSetupState(); // Atualizar estado do wizard
            installationInProgressRef.current = false;
            return;
          } catch (error) {
            console.warn('Falha ao usar Chocolatey, usando instalação direta:', error);
            setUseChocolatey(false);
            setShowTerminal(false);
          }
        }
      }
      
      // Fallback: instalação direta
      if (!downloadState.filePath && detectedOS) {
        await downloadState.handleDownload(detectedOS);
      }

      if (downloadState.filePath) {
        await installOllama(downloadState.filePath);
      } else {
        await installOllama();
      }
      
      // Após instalação, fazer polling ativo
      setStepState('VERIFYING');
      await waitForService(15); // 15 tentativas = 30 segundos
      // Se chegou aqui, Ollama está funcional
      setStepState('SUCCESS');
      await checkSetupState(); // Atualizar estado do wizard
    } catch (error) {
      console.error('Erro ao aguardar serviço:', error);
      setStepState('IDLE');
    } finally {
      installationInProgressRef.current = false;
    }
  };

  // Estado SUCCESS: mostrar mensagem de sucesso e botão Continuar
  if (stepState === 'SUCCESS' || (state.ollamaInstalled && state.ollamaRunning)) {
    return (
      <Card className="w-full max-w-2xl mx-auto border-zinc-800 bg-zinc-950/50 backdrop-blur-sm shadow-2xl">
        <CardHeader className="p-6 sm:p-8">
          <CardTitle className="text-2xl font-bold text-white flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
            <span>Instalação Concluída</span>
          </CardTitle>
          <CardDescription className="text-zinc-400 mb-8 text-base">
            Ollama está instalado e rodando com sucesso.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 sm:px-8 pb-6 sm:pb-8 pt-0 space-y-6">
          <div className="flex items-start sm:items-center gap-3 p-4 bg-emerald-950/30 rounded-lg border border-emerald-900/50">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-emerald-100">Ollama Service is Running</p>
              <p className="text-xs text-emerald-300 mt-1">Pronto para continuar com o download de modelos.</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end p-6 sm:p-8 pt-6 mt-0 border-t border-zinc-800">
          <Button onClick={onNext} className="w-full sm:w-auto bg-white text-black hover:bg-zinc-200 h-12 px-8 text-base font-medium">
            Continuar <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Estado IDLE: mostrar card informativo
  if (stepState === 'IDLE') {
    return (
      <Card className="w-full max-w-2xl mx-auto border-zinc-800 bg-zinc-950/50 backdrop-blur-sm shadow-2xl">
        <CardHeader className="p-6 sm:p-8">
          <CardTitle className="text-2xl font-bold text-white flex items-center gap-2 mb-2">
            <Download className="w-6 h-6 shrink-0" />
            <span>Ollama Engine</span>
          </CardTitle>
          <CardDescription className="text-zinc-400 mb-8 text-base">
            O OllaHub requer o motor Ollama para executar IAs localmente.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 sm:px-8 pb-6 sm:pb-8 pt-0 space-y-6">
          <p className="text-sm text-zinc-400 leading-relaxed">
            O Ollama é uma ferramenta open-source que permite executar modelos de linguagem grandes (LLMs) diretamente no seu computador, sem necessidade de conexão com a internet.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-end gap-4 p-6 sm:p-8 pt-6 mt-0 border-t border-zinc-800">
          <Button onClick={handleCheckExisting} variant="outline" className="w-full sm:w-auto h-12 border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            Já tenho o Ollama instalado
          </Button>
          <Button onClick={handleInstall} className="w-full sm:w-auto bg-white text-black hover:bg-zinc-200 h-12 px-8 text-base font-medium">
            <Download className="w-4 h-4 mr-2" />
            Instalar Ollama
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const errorType = state.lastError ? parseInstallError(state.lastError) : null;
  const showRetryButton = state.lastError || state.progressStatus === 'error';
  const showManualRetry = showRetryButton && state.lastError;
  const hasTerminal = showTerminal && (state.progressStatus === 'installing_chocolatey' || state.progressStatus === 'installing_ollama' || useChocolatey);

  return (
    <Card className={`w-full max-w-2xl mx-auto border-zinc-800 bg-zinc-950/50 backdrop-blur-sm shadow-2xl ${hasTerminal ? 'max-h-[calc(100vh-16rem)] flex flex-col' : ''}`}>
      <CardHeader className={`p-6 sm:p-8 ${hasTerminal ? 'flex-shrink-0' : ''}`}>
        <CardTitle className="text-2xl font-bold text-white flex items-center gap-2 mb-2">
            {stepState === 'INSTALLING' && <Loader2 className="w-6 h-6 animate-spin" />}
            {stepState === 'VERIFYING' && <Loader2 className="w-6 h-6 animate-spin" />}
            {(state.lastError || state.progressStatus === 'error') && <AlertCircle className="w-6 h-6 text-red-500" />}
            <span>
                {stepState === 'INSTALLING' ? 'Instalando Ollama...' : 
                 stepState === 'VERIFYING' ? 'Verificando Instalação...' :
                 'Instalação em Progresso'}
            </span>
        </CardTitle>
        <CardDescription className="text-zinc-400 mb-8 text-base">
            Acompanhe o progresso da configuração do ambiente.
        </CardDescription>
      </CardHeader>
      
      <CardContent className={`px-6 sm:px-8 pb-6 sm:pb-8 pt-0 space-y-6 ${hasTerminal ? 'flex-1 min-h-0 overflow-y-auto' : ''}`}>
        {/* Terminal integrado para instalação via Chocolatey */}
        {(showTerminal && (state.progressStatus === 'installing_chocolatey' || state.progressStatus === 'installing_ollama' || useChocolatey)) && (
          <InstallationTerminal
            onComplete={() => {
              setShowTerminal(false);
            }}
            onError={(error) => {
              console.error('Erro na instalação:', error);
            }}
          />
        )}

        {/* Progresso para instalação direta (fallback) */}
        {state.progressMessage && !showTerminal && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{state.progressMessage}</span>
              {ollamaCheck.isChecking && (
                <span className="text-xs text-muted-foreground">
                  Verificando... {formatTime(ollamaCheck.elapsedTime)}
                </span>
              )}
            </div>
            {state.progressStatus === 'installing_ollama' && (
              <Progress value={undefined} className="h-2" />
            )}
          </div>
        )}

        {/* Feedback do polling em background (estado VERIFYING) */}
        {stepState === 'VERIFYING' && (
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground p-4 bg-muted/50 rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="break-words">
              Instalação concluída. Aguardando inicialização do serviço...
            </span>
          </div>
        )}

        {/* Display de erro granular */}
        {state.lastError && errorType && (
          <ErrorDisplay
            errorType={errorType}
            errorMessage={state.lastError}
            onRetry={handleManualRetry}
            isRetrying={isRetrying}
          />
        )}

        {/* Botão de retry manual quando não há erro específico */}
        {showRetryButton && !showManualRetry && (
          <Button 
            onClick={handleManualRetry} 
            disabled={isRetrying || stepState === 'INSTALLING'}
            variant="outline"
            className="w-full"
          >
            {isRetrying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Verificar Novamente
              </>
            )}
          </Button>
        )}

        {downloadState.isDownloading && (
          <div className="space-y-2 w-full">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                {downloadState.status === 'verifying' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                {downloadState.status === 'verifying' 
                  ? 'Verificando integridade...' 
                  : 'Baixando...'}
              </span>
              <span className="font-mono">{downloadState.speed || '0 MB/s'}</span>
            </div>
            
            <Progress 
              value={downloadState.downloadProgress} 
              className="h-2 w-full transition-all duration-300" 
            />
            
            <div className="flex justify-between text-[10px] text-muted-foreground/70 uppercase font-medium tracking-wider">
              <span>
                {formatBytes(downloadState.downloadedBytes)} / {formatBytes(downloadState.totalBytes)}
              </span>
              <span>{downloadState.downloadProgress.toFixed(1)}%</span>
            </div>
            
            {downloadState.eta > 0 && downloadState.status === 'downloading' && (
              <div className="text-xs text-muted-foreground text-center">
                Tempo restante: {formatTime(downloadState.eta)}
              </div>
            )}
          </div>
        )}

        {/* Estado INSTALLING: mostrar progresso */}
        {stepState === 'INSTALLING' && (
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="break-words">Instalando Ollama... Isso pode levar alguns minutos.</span>
          </div>
        )}
      </CardContent>
      {/* Footer opcional se necessário */}
    </Card>
  );
}