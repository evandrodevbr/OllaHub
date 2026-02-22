'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Download,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Settings,
  Wrench,
  Server,
  Cpu,
  HardDrive,
  MemoryStick,
  Shield,
  Zap,
  Terminal
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useToast } from '@/hooks/use-toast';
import { SearxngInstallWizard } from './searxng-install-wizard';
import { DockerCommandsModal } from './docker-commands-modal';
import { findProblemSolution, ProblemSolution } from '@/lib/docker-problems';
import { cn } from '@/lib/utils';

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

interface FixProgressEvent {
  event_type: 'start' | 'progress' | 'complete' | 'error';
  message: string;
  progress?: number;
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

export function DockerSettingsPanel() {
  const { toast } = useToast();
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const [dockerRunning, setDockerRunning] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [requirements, setRequirements] = useState<SystemRequirements | null>(null);
  const [isCheckingRequirements, setIsCheckingRequirements] = useState(false);
  const [isInstallingDocker, setIsInstallingDocker] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [fixProgress, setFixProgress] = useState<{ message: string; progress: number } | null>(null);
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
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showInstallWizard, setShowInstallWizard] = useState(false);
  const [showCommandsModal, setShowCommandsModal] = useState(false);
  const [selectedProblem, setSelectedProblem] = useState<ProblemSolution | null>(null);

  // Verificar Docker ao montar
  useEffect(() => {
    checkDocker();
    checkRequirements();
  }, []);

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
            toast({
              title: 'Erro na instalação',
              description: data.message || 'Erro desconhecido',
              variant: 'destructive',
            });
            setIsInstallingDocker(false);
            break;
            
          case 'complete':
            setDockerInstallProgress(prev => ({ ...prev, progress: 100 }));
            setIsInstallingDocker(false);
            toast({
              title: 'Docker instalado',
              description: 'Docker foi instalado com sucesso!',
            });
            setTimeout(() => {
              validateDocker();
              checkDocker();
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
  }, [isInstallingDocker, toast]);

  // Listener de eventos de correção
  useEffect(() => {
    let unlistenPromise: Promise<() => void> | null = null;

    if (isFixing) {
      unlistenPromise = listen<FixProgressEvent>('docker-fix-progress', (event) => {
        const data = event.payload;
        
        switch (data.event_type) {
          case 'start':
            setFixProgress({ message: data.message, progress: 0 });
            break;
          case 'progress':
            setFixProgress({ message: data.message, progress: data.progress || 0 });
            break;
          case 'complete':
            setFixProgress({ message: data.message, progress: 100 });
            setTimeout(() => {
              setIsFixing(false);
              setFixProgress(null);
              checkRequirements();
              toast({
                title: 'Correção concluída',
                description: data.message,
              });
            }, 1500);
            break;
          case 'error':
            setIsFixing(false);
            setFixProgress(null);
            toast({
              title: 'Erro na correção',
              description: data.message,
              variant: 'destructive',
            });
            break;
        }
      });
    }

    return () => {
      if (unlistenPromise) {
        unlistenPromise.then(fn => fn());
      }
    };
  }, [isFixing, toast]);

  const checkDocker = async () => {
    setIsChecking(true);
    try {
      const available = await invoke<boolean>('check_docker_available');
      setDockerAvailable(available);
      
      if (available) {
        const running = await invoke<boolean>('check_docker_running');
        setDockerRunning(running);
      } else {
        setDockerRunning(false);
      }
    } catch (error) {
      console.error('Error checking Docker:', error);
      setDockerAvailable(false);
      setDockerRunning(false);
    } finally {
      setIsChecking(false);
    }
  };

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

  const handleFixRequirements = async () => {
    if (!requirements || requirements.issues.length === 0) {
      toast({
        title: 'Nada para corrigir',
        description: 'Não há problemas encontrados que possam ser corrigidos automaticamente',
      });
      return;
    }

    setIsFixing(true);
    setFixProgress({ message: 'Preparando correção...', progress: 0 });

    try {
      await invoke('fix_docker_requirements', {
        os: requirements.os,
        issues: requirements.issues,
      });
    } catch (error) {
      console.error('Error fixing requirements:', error);
      setIsFixing(false);
      setFixProgress(null);
      toast({
        title: 'Erro na correção',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  const handleInstallDocker = async () => {
    setIsInstallingDocker(true);
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
      toast({
        title: 'Erro na instalação',
        description: error instanceof Error ? error.message : 'Erro desconhecido durante instalação do Docker',
        variant: 'destructive',
      });
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
        setDockerAvailable(true);
        setDockerRunning(true);
        toast({
          title: 'Docker validado',
          description: 'Docker está funcionando corretamente',
        });
      } else {
        toast({
          title: 'Validação falhou',
          description: 'Alguns testes de validação falharam',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        title: 'Erro na validação',
        description: error instanceof Error ? error.message : 'Erro ao validar Docker',
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };


  const getStatusIcon = (status: 'pass' | 'fail' | 'warn') => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warn':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Status do Docker */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Status do Docker</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={checkDocker}
              disabled={isChecking}
            >
              <RefreshCw className={cn("w-4 h-4 mr-1", isChecking && "animate-spin")} />
              Atualizar
            </Button>
          </div>
          <CardDescription>
            Verifique se Docker está instalado e rodando
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isChecking ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Verificando...</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className={cn(
                  "p-4 rounded-lg border-2 transition-colors",
                  dockerAvailable 
                    ? "border-green-500/50 bg-green-500/10 dark:bg-green-500/20" 
                    : "border-red-500/50 bg-red-500/10 dark:bg-red-500/20"
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-foreground">Instalação</span>
                    {dockerAvailable ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      dockerAvailable 
                        ? "text-green-700 dark:text-green-300 border-green-600 dark:border-green-400 bg-green-100 dark:bg-green-500/20" 
                        : "text-red-700 dark:text-red-300 border-red-600 dark:border-red-400 bg-red-100 dark:bg-red-500/20"
                    )}
                  >
                    {dockerAvailable ? 'Instalado' : 'Não Instalado'}
                  </Badge>
                </div>

                <div className={cn(
                  "p-4 rounded-lg border-2 transition-colors",
                  dockerRunning 
                    ? "border-green-500/50 bg-green-500/10 dark:bg-green-500/20" 
                    : "border-red-500/50 bg-red-500/10 dark:bg-red-500/20"
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-foreground">Serviço</span>
                    {dockerRunning ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      dockerRunning 
                        ? "text-green-700 dark:text-green-300 border-green-600 dark:border-green-400 bg-green-100 dark:bg-green-500/20" 
                        : "text-red-700 dark:text-red-300 border-red-600 dark:border-red-400 bg-red-100 dark:bg-red-500/20"
                    )}
                  >
                    {dockerRunning ? 'Rodando' : 'Parado'}
                  </Badge>
                </div>
              </div>

              {dockerAvailable === false && (
                <Alert variant="destructive">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    Docker não está instalado. Instale-o para usar SearXNG.
                  </AlertDescription>
                </Alert>
              )}

              {dockerAvailable && !dockerRunning && (
                <Alert>
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    Docker está instalado mas não está rodando. Inicie o Docker Desktop.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Requisitos do Sistema */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Requisitos do Sistema</CardTitle>
            </div>
            <div className="flex gap-2">
              {requirements && requirements.issues.length > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleFixRequirements}
                  disabled={isFixing || isCheckingRequirements}
                >
                  <Wrench className="w-4 h-4 mr-1" />
                  Corrigir
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={checkRequirements}
                disabled={isCheckingRequirements}
              >
                <RefreshCw className={cn("w-4 h-4 mr-1", isCheckingRequirements && "animate-spin")} />
                Verificar
              </Button>
            </div>
          </div>
          <CardDescription>
            Verifique se seu sistema atende aos requisitos para Docker
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isCheckingRequirements ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Verificando requisitos...</span>
            </div>
          ) : requirements ? (
            <>
              {/* Status Geral */}
              <div className={cn(
                "p-4 rounded-lg border-2 flex items-center justify-between",
                requirements.status === 'pass' && "border-green-500/50 bg-green-500/10 dark:bg-green-500/20",
                requirements.status === 'warn' && "border-yellow-500/50 bg-yellow-500/10 dark:bg-yellow-500/20",
                requirements.status === 'fail' && "border-red-500/50 bg-red-500/10 dark:bg-red-500/20"
              )}>
                <div className="flex items-center gap-3">
                  {getStatusIcon(requirements.status)}
                  <div>
                    <p className="font-semibold text-foreground">Status Geral</p>
                    <p className="text-xs text-muted-foreground">
                      {requirements.status === 'pass' && 'Sistema compatível'}
                      {requirements.status === 'warn' && 'Avisos encontrados'}
                      {requirements.status === 'fail' && 'Problemas encontrados'}
                    </p>
                  </div>
                </div>
                <Badge className={cn(
                  requirements.status === 'pass' && "bg-green-500",
                  requirements.status === 'warn' && "bg-yellow-500",
                  requirements.status === 'fail' && "bg-red-500"
                )}>
                  {requirements.status === 'pass' && 'Compatível'}
                  {requirements.status === 'warn' && 'Avisos'}
                  {requirements.status === 'fail' && 'Incompatível'}
                </Badge>
              </div>

              {/* Especificações do Sistema */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2 mb-1">
                    <MemoryStick className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">RAM</span>
                  </div>
                  <p className="text-sm font-medium">{(requirements.ram_mb / 1024).toFixed(1)} GB</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Disco Livre</span>
                  </div>
                  <p className="text-sm font-medium">{requirements.disk_gb} GB</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">CPU Cores</span>
                  </div>
                  <p className="text-sm font-medium">{requirements.cpu_cores}</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Sistema</span>
                  </div>
                  <p className="text-sm font-medium">{requirements.os} ({requirements.arch})</p>
                </div>
              </div>

              {/* Progresso de Correção */}
              {isFixing && fixProgress && (
                <div className="space-y-2 p-4 rounded-lg border bg-blue-50 border-blue-200">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{fixProgress.message}</span>
                    <span>{fixProgress.progress}%</span>
                  </div>
                  <Progress value={fixProgress.progress} className="h-2" />
                </div>
              )}

              {/* Problemas */}
              {requirements.issues.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    <p className="font-medium mb-2">Problemas Encontrados:</p>
                    <ul className="space-y-2 text-sm">
                      {requirements.issues.map((issue, idx) => {
                        const solution = findProblemSolution(issue, requirements.os);
                        return (
                          <li key={idx} className="flex items-start justify-between gap-2">
                            <span className="flex-1">{issue}</span>
                            {solution && (
                              <div className="flex gap-1 shrink-0">
                                {solution.commands && solution.commands.length > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedProblem(solution);
                                      setShowCommandsModal(true);
                                    }}
                                    className="h-7 text-xs"
                                  >
                                    <Terminal className="w-3 h-3 mr-1" />
                                    Comandos
                                  </Button>
                                )}
                                {solution.links.length > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      if (solution.links[0]) {
                                        try {
                                          await invoke('open_url', { url: solution.links[0].url });
                                        } catch (error) {
                                          console.error('Error opening URL:', error);
                                          window.open(solution.links[0].url, '_blank', 'noopener,noreferrer');
                                        }
                                      }
                                    }}
                                    className="h-7 text-xs"
                                  >
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                    Docs
                                  </Button>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Avisos */}
              {requirements.warnings.length > 0 && (
                <Alert>
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    <p className="font-medium mb-2">Avisos:</p>
                    <ul className="space-y-2 text-sm">
                      {requirements.warnings.map((warning, idx) => {
                        const solution = findProblemSolution(warning, requirements.os);
                        return (
                          <li key={idx} className="flex items-start justify-between gap-2">
                            <span className="flex-1">{warning}</span>
                            {solution && (
                              <div className="flex gap-1 shrink-0">
                                {solution.commands && solution.commands.length > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSelectedProblem(solution);
                                      setShowCommandsModal(true);
                                    }}
                                    className="h-7 text-xs"
                                  >
                                    <Terminal className="w-3 h-3 mr-1" />
                                    Comandos
                                  </Button>
                                )}
                                {solution.links.length > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      if (solution.links[0]) {
                                        try {
                                          await invoke('open_url', { url: solution.links[0].url });
                                        } catch (error) {
                                          console.error('Error opening URL:', error);
                                          window.open(solution.links[0].url, '_blank', 'noopener,noreferrer');
                                        }
                                      }
                                    }}
                                    className="h-7 text-xs"
                                  >
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                    Docs
                                  </Button>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Instalação Docker */}
      {dockerAvailable === false && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Instalar Docker</CardTitle>
            </div>
            <CardDescription>
              Instale Docker automaticamente ou manualmente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  window.open('https://www.docker.com/products/docker-desktop', '_blank');
                }}
                className="flex-1"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Instalação Manual
              </Button>
              <Button
                variant="default"
                onClick={handleInstallDocker}
                disabled={isInstallingDocker || requirements?.status === 'fail'}
                className="flex-1"
              >
                {isInstallingDocker ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Instalando...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Instalar Agora
                  </>
                )}
              </Button>
            </div>

            {isInstallingDocker && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{dockerInstallProgress.currentStepName || 'Instalando Docker...'}</span>
                    <span className="text-muted-foreground">{dockerInstallProgress.progress}%</span>
                  </div>
                  <Progress value={dockerInstallProgress.progress} className="h-2" />
                </div>
                
                {dockerInstallProgress.logs.length > 0 && (
                  <div className="bg-black text-green-400 font-mono text-xs p-3 rounded-lg h-40 overflow-y-auto">
                    {dockerInstallProgress.logs.map((log, idx) => (
                      <div key={idx}>{log}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Validação */}
      {dockerAvailable && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Validação</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={validateDocker}
                disabled={isValidating}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Validando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Validar
                  </>
                )}
              </Button>
            </div>
            <CardDescription>
              Execute testes para verificar se Docker está funcionando corretamente
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validationResult ? (
              <div className="space-y-2">
                {validationResult.tests.map((test, idx) => (
                  <div 
                    key={idx} 
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      test.status === 'pass' && "bg-green-50 border-green-200",
                      test.status === 'warn' && "bg-yellow-50 border-yellow-200",
                      test.status === 'fail' && "bg-red-50 border-red-200"
                    )}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{test.name}</p>
                      {test.message && (
                        <p className="text-xs text-muted-foreground mt-1">{test.message}</p>
                      )}
                    </div>
                    {test.status === 'pass' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : test.status === 'warn' ? (
                      <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    )}
                  </div>
                ))}
                {validationResult.docker_version && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Docker {validationResult.docker_version} instalado
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Clique em "Validar" para executar os testes
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Botão para configurar SearXNG */}
      {dockerAvailable && dockerRunning && (
        <Card>
          <CardContent className="pt-6">
            <Button
              variant="default"
              onClick={() => setShowInstallWizard(true)}
              className="w-full"
              size="lg"
            >
              <Settings className="w-5 h-5 mr-2" />
              Configurar SearXNG
            </Button>
          </CardContent>
        </Card>
      )}

      {showInstallWizard && (
        <SearxngInstallWizard
          onComplete={() => {
            setShowInstallWizard(false);
            checkDocker();
            toast({
              title: 'SearXNG configurado',
              description: 'SearXNG foi instalado e configurado com sucesso!',
            });
          }}
          onCancel={() => setShowInstallWizard(false)}
          initialUrl="http://localhost:8080"
        />
      )}

      <DockerCommandsModal
        open={showCommandsModal}
        onOpenChange={setShowCommandsModal}
        problem={selectedProblem}
      />
    </div>
  );
}
