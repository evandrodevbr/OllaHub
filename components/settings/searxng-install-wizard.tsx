'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ArrowLeft, 
  ArrowRight, 
  AlertCircle,
  ExternalLink,
  Download,
  Settings,
  Play,
  Square,
  X
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { cn } from '@/lib/utils';

interface SearxngInstallWizardProps {
  onComplete: () => void;
  onCancel: () => void;
  initialUrl?: string;
}

type Step = 0 | 1 | 2 | 3 | 4 | 5;

interface SystemRequirements {
  status: 'pass' | 'fail' | 'warn';
  os: string;
  arch: string;
  ram_mb: number;
  disk_gb: number;
  cpu_cores: number;
  kernel_version?: string;
  issues: string[];
  warnings: string[];
}

interface InstallProgressEvent {
  event_type: 'step_start' | 'log' | 'step_complete' | 'error' | 'complete';
  step?: number;
  step_name?: string;
  total_steps?: number;
  progress: number;
  message?: string;
  log_line?: string;
}

interface ValidationResult {
  status: 'pass' | 'fail' | 'partial';
  tests: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message?: string;
  }>;
  docker_version?: string;
}

export function SearxngInstallWizard({ onComplete, onCancel, initialUrl = 'http://localhost:8080' }: SearxngInstallWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>(0);
  const [requirements, setRequirements] = useState<SystemRequirements | null>(null);
  const [isCheckingRequirements, setIsCheckingRequirements] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const [dockerRunning, setDockerRunning] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [url, setUrl] = useState(initialUrl);
  const [port, setPort] = useState('8080');
  const [autoStart, setAutoStart] = useState(true);
  const [installProgress, setInstallProgress] = useState<string>('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [dockerInstallProgress, setDockerInstallProgress] = useState<{
    currentStep: number;
    totalSteps: number;
    progress: number;
    currentStepName: string;
    logs: string[];
  }>({
    currentStep: 0,
    totalSteps: 0,
    progress: 0,
    currentStepName: '',
    logs: [],
  });
  const [isInstallingDocker, setIsInstallingDocker] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'checking' | 'success' | 'error' | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Step 0: Verificar Requisitos
  useEffect(() => {
    if (currentStep === 0) {
      checkRequirements();
    }
  }, [currentStep]);

  // Step 1: Verificar Docker
  useEffect(() => {
    if (currentStep === 1) {
      checkDocker();
    }
  }, [currentStep]);

  // Listener de eventos de progresso Docker
  useEffect(() => {
    let unlistenPromise: Promise<() => void> | null = null;

    if (isInstallingDocker) {
      unlistenPromise = listen<InstallProgressEvent>('docker-install-progress', (event) => {
        const data = event.payload;
        
        switch (data.event_type) {
          case 'step_start':
            setDockerInstallProgress(prev => ({
              ...prev,
              currentStep: data.step || 0,
              totalSteps: data.total_steps || prev.totalSteps,
              currentStepName: data.step_name || '',
              progress: data.progress,
            }));
            if (data.message) {
              setDockerInstallProgress(prev => ({
                ...prev,
                logs: [...prev.logs.slice(-49), data.message!],
              }));
            }
            break;
            
          case 'log':
            if (data.log_line) {
              setDockerInstallProgress(prev => ({
                ...prev,
                logs: [...prev.logs.slice(-49), data.log_line!],
              }));
            }
            break;
            
          case 'step_complete':
            setDockerInstallProgress(prev => ({
              ...prev,
              progress: data.progress,
            }));
            if (data.message) {
              setDockerInstallProgress(prev => ({
                ...prev,
                logs: [...prev.logs.slice(-49), data.message!],
              }));
            }
            break;
            
          case 'error':
            setInstallError(data.message || 'Erro desconhecido');
            setIsInstallingDocker(false);
            break;
            
          case 'complete':
            setDockerInstallProgress(prev => ({ ...prev, progress: 100 }));
            setIsInstallingDocker(false);
            // Validar instalação após conclusão
            setTimeout(() => {
              validateDocker();
            }, 1000);
            break;
        }
      });
    }

    return () => {
      if (unlistenPromise) {
        unlistenPromise.then(fn => fn());
      }
    };
  }, [isInstallingDocker]);

  const checkRequirements = async () => {
    setIsCheckingRequirements(true);
    try {
      const reqs = await invoke<SystemRequirements>('check_docker_requirements');
      setRequirements(reqs);
    } catch (error) {
      console.error('Error checking requirements:', error);
      setRequirements({
        status: 'fail',
        os: 'unknown',
        arch: 'unknown',
        ram_mb: 0,
        disk_gb: 0,
        cpu_cores: 0,
        issues: ['Erro ao verificar requisitos do sistema'],
        warnings: [],
      });
    } finally {
      setIsCheckingRequirements(false);
    }
  };

  const checkDocker = async () => {
    setIsChecking(true);
    try {
      const available = await invoke<boolean>('check_docker_available');
      setDockerAvailable(available);
      
      if (available) {
        const running = await invoke<boolean>('check_docker_running');
        setDockerRunning(running);
      }
    } catch (error) {
      console.error('Error checking Docker:', error);
      setDockerAvailable(false);
      setDockerRunning(false);
    } finally {
      setIsChecking(false);
    }
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep((prev) => (prev + 1) as Step);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => (prev - 1) as Step);
    }
  };

  const handleInstallDocker = async () => {
    setIsInstallingDocker(true);
    setInstallError(null);
    setDockerInstallProgress({
      currentStep: 0,
      totalSteps: 0,
      progress: 0,
      currentStepName: '',
      logs: [],
    });

    try {
      await invoke('install_docker');
    } catch (error) {
      console.error('Docker installation error:', error);
      setInstallError(error instanceof Error ? error.message : 'Erro desconhecido durante instalação do Docker');
      setIsInstallingDocker(false);
    }
  };

  const validateDocker = async () => {
    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await invoke<ValidationResult>('validate_docker_installation');
      setValidationResult(result);
      
      if (result.status === 'pass' || result.status === 'partial') {
        // Docker validado, atualizar estado
        setDockerAvailable(true);
        setDockerRunning(true);
      }
    } catch (error) {
      console.error('Validation error:', error);
      setValidationResult({
        status: 'fail',
        tests: [{
          name: 'Validação',
          status: 'fail',
          message: error instanceof Error ? error.message : 'Erro ao validar Docker',
        }],
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    setInstallError(null);
    setInstallProgress('Iniciando instalação...');

    try {
      setInstallProgress('Baixando imagem SearXNG...');
      await invoke('install_searxng', { url, port: parseInt(port, 10) });
      
      setInstallProgress('Criando container...');
      // Installation is handled by install_searxng command
      
      setInstallProgress('Iniciando serviços...');
      await invoke('start_searxng');
      
      setInstallProgress('Instalação concluída!');
      setTimeout(() => {
        handleNext();
      }, 1000);
    } catch (error) {
      console.error('Installation error:', error);
      setInstallError(error instanceof Error ? error.message : 'Erro desconhecido durante instalação');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleVerify = async () => {
    setVerificationStatus('checking');
    setVerificationError(null);

    try {
      const isAvailable = await invoke<boolean>('check_searxng_status', { url });
      
      if (isAvailable) {
        setVerificationStatus('success');
        setTimeout(() => {
          onComplete();
        }, 1500);
      } else {
        setVerificationStatus('error');
        setVerificationError('SearXNG não está respondendo. Verifique se o container está rodando.');
      }
    } catch (error) {
      setVerificationStatus('error');
      setVerificationError(error instanceof Error ? error.message : 'Erro ao verificar SearXNG');
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Verificação de Requisitos do Sistema</h3>
              <p className="text-sm text-muted-foreground">
                Verificando se seu sistema atende aos requisitos para instalação do Docker.
              </p>
            </div>

            {isCheckingRequirements ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-3 text-sm text-muted-foreground">Verificando requisitos...</span>
              </div>
            ) : requirements ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-medium text-lg">Status Geral</span>
                    {requirements.status === 'pass' ? (
                      <Badge className="bg-green-500">Compatível</Badge>
                    ) : requirements.status === 'warn' ? (
                      <Badge className="bg-yellow-500">Avisos</Badge>
                    ) : (
                      <Badge className="bg-red-500">Incompatível</Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Sistema Operacional</p>
                      <p className="font-medium">{requirements.os} ({requirements.arch})</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">RAM</p>
                      <p className="font-medium">{(requirements.ram_mb / 1024).toFixed(1)} GB</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Disco Livre</p>
                      <p className="font-medium">{requirements.disk_gb} GB</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">CPU Cores</p>
                      <p className="font-medium">{requirements.cpu_cores}</p>
                    </div>
                  </div>
                  
                  {requirements.kernel_version && (
                    <div className="mt-4">
                      <p className="text-xs text-muted-foreground">Versão do Kernel</p>
                      <p className="font-medium">{requirements.kernel_version}</p>
                    </div>
                  )}
                </div>

                {requirements.issues.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>
                      <div className="space-y-2">
                        <p className="font-medium">Problemas Encontrados:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          {requirements.issues.map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {requirements.warnings.length > 0 && (
                  <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>
                      <div className="space-y-2">
                        <p className="font-medium">Avisos:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          {requirements.warnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={checkRequirements} disabled={isCheckingRequirements}>
                    Verificar Novamente
                  </Button>
                  <Button
                    onClick={handleNext}
                    disabled={requirements.status === 'fail'}
                    className="ml-auto"
                  >
                    Continuar
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Verificação de Docker</h3>
              <p className="text-sm text-muted-foreground">
                SearXNG requer Docker para funcionar. Vamos verificar se está instalado e rodando.
              </p>
            </div>

            {isChecking ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-3 text-sm text-muted-foreground">Verificando Docker...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Docker Instalado</span>
                    {dockerAvailable === null ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : dockerAvailable ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                  {dockerAvailable === false && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Docker não está instalado. Você precisa instalá-lo primeiro.
                    </p>
                  )}
                </div>

                {dockerAvailable && (
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Docker Rodando</span>
                      {dockerRunning === null ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : dockerRunning ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    {dockerRunning === false && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Docker está instalado mas não está rodando. Inicie o Docker Desktop.
                      </p>
                    )}
                  </div>
                )}

                {dockerAvailable === false && (
                  <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>
                      <div className="space-y-2">
                        <p>Docker não está instalado. Você pode instalá-lo agora ou manualmente.</p>
                        <div className="flex gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={handleInstallDocker}
                            disabled={isInstallingDocker}
                          >
                            {isInstallingDocker ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Instalando...
                              </>
                            ) : (
                              <>
                                <Download className="w-4 h-4 mr-2" />
                                Instalar Docker Agora
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              window.open('https://www.docker.com/products/docker-desktop', '_blank');
                            }}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Instalar Manualmente
                          </Button>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {isInstallingDocker && (
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>{dockerInstallProgress.currentStepName || 'Instalando Docker...'}</span>
                        <span>{dockerInstallProgress.progress}%</span>
                      </div>
                      <Progress value={dockerInstallProgress.progress} />
                    </div>
                    
                    {dockerInstallProgress.logs.length > 0 && (
                      <div className="bg-black text-green-400 font-mono text-xs p-4 rounded-lg h-48 overflow-y-auto">
                        {dockerInstallProgress.logs.map((log, idx) => (
                          <div key={idx}>{log}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {validationResult && (
                  <div className="space-y-2 mt-4">
                    <h4 className="font-medium">Resultados da Validação:</h4>
                    {validationResult.tests.map((test, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                        <span className="text-sm">{test.name}</span>
                        {test.status === 'pass' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : test.status === 'warn' ? (
                          <AlertCircle className="w-4 h-4 text-yellow-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    ))}
                    {validationResult.docker_version && (
                      <p className="text-xs text-muted-foreground">
                        Docker {validationResult.docker_version} instalado
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={checkDocker} disabled={isChecking}>
                    Verificar Novamente
                  </Button>
                  {validationResult && (validationResult.status === 'pass' || validationResult.status === 'partial') && (
                    <Button
                      onClick={handleNext}
                      className="ml-auto"
                    >
                      Continuar
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                  {!validationResult && dockerAvailable && dockerRunning && (
                    <Button
                      onClick={handleNext}
                      className="ml-auto"
                    >
                      Continuar
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                  {!dockerAvailable && !isInstallingDocker && (
                    <Button
                      onClick={handleNext}
                      variant="outline"
                      className="ml-auto"
                    >
                      Pular Instalação Docker
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Configuração</h3>
              <p className="text-sm text-muted-foreground">
                Configure a URL e porta onde SearXNG será acessível.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="searxng-url">URL do SearXNG</Label>
                <Input
                  id="searxng-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://localhost:8080"
                />
                <p className="text-xs text-muted-foreground">
                  URL completa onde o SearXNG estará acessível
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="searxng-port">Porta</Label>
                <Input
                  id="searxng-port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="8080"
                  min="1024"
                  max="65535"
                />
                <p className="text-xs text-muted-foreground">
                  Porta que será usada pelo container (padrão: 8080)
                </p>
              </div>

              <div className="flex items-center space-x-2 p-4 rounded-lg border bg-muted/30">
                <Checkbox
                  id="auto-start"
                  checked={autoStart}
                  onCheckedChange={(checked) => setAutoStart(checked === true)}
                />
                <Label htmlFor="auto-start" className="cursor-pointer">
                  Iniciar automaticamente com o OllaHub
                </Label>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
              <Button onClick={handleNext} className="ml-auto">
                Continuar
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Instalação do SearXNG</h3>
              <p className="text-sm text-muted-foreground">
                Instalando e configurando SearXNG. Isso pode levar alguns minutos.
              </p>
            </div>

            {isInstalling ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <div className="flex-1">
                      <p className="font-medium">{installProgress}</p>
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : installError ? (
              <Alert variant="destructive">
                <XCircle className="w-4 h-4" />
                <AlertDescription>
                  <p className="font-medium mb-2">Erro durante instalação</p>
                  <p className="text-sm">{installError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleInstall}
                    className="mt-3"
                  >
                    Tentar Novamente
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="p-4 rounded-lg border bg-green-500/10 border-green-500/20">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-medium">Instalação concluída!</p>
                    <p className="text-sm text-muted-foreground">
                      SearXNG foi instalado com sucesso.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack} disabled={isInstalling}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
              {!isInstalling && !installError && (
                <Button onClick={handleNext} className="ml-auto">
                  Continuar
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
              {isInstalling && (
                <Button variant="outline" onClick={onCancel} className="ml-auto">
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Verificação</h3>
              <p className="text-sm text-muted-foreground">
                Verificando se SearXNG está funcionando corretamente.
              </p>
            </div>

            {verificationStatus === null && (
              <div className="p-4 rounded-lg border bg-muted/30 text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Clique em "Verificar" para testar a conexão com SearXNG.
                </p>
                <Button onClick={handleVerify} size="lg">
                  <Play className="w-4 h-4 mr-2" />
                  Verificar
                </Button>
              </div>
            )}

            {verificationStatus === 'checking' && (
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span>Verificando conexão...</span>
                </div>
              </div>
            )}

            {verificationStatus === 'success' && (
              <div className="p-4 rounded-lg border bg-green-500/10 border-green-500/20">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-medium">SearXNG está disponível!</p>
                    <p className="text-sm text-muted-foreground">
                      A conexão foi estabelecida com sucesso.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {verificationStatus === 'error' && (
              <Alert variant="destructive">
                <XCircle className="w-4 h-4" />
                <AlertDescription>
                  <p className="font-medium mb-2">Falha na verificação</p>
                  <p className="text-sm mb-3">{verificationError || 'SearXNG não está respondendo'}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleVerify}>
                      Tentar Novamente
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await invoke('start_searxng');
                          setTimeout(handleVerify, 2000);
                        } catch (error) {
                          console.error('Error starting SearXNG:', error);
                        }
                      }}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Iniciar Container
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack} disabled={verificationStatus === 'checking'}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
              {verificationStatus === 'success' && (
                <Button onClick={onComplete} className="ml-auto">
                  Concluir
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-2xl relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10"
          aria-label="Fechar"
          disabled={isInstalling || isInstallingDocker}
        >
          <X className="w-4 h-4" />
        </Button>
        <CardHeader>
          <CardTitle>SearXNG - Instalação</CardTitle>
          <CardDescription>
            Passo {currentStep + 1} de 6
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderStep()}
        </CardContent>
      </Card>
    </div>
  );
}
