'use client';

import { usePythonBootstrap } from '@/hooks/use-python-bootstrap';
import { Progress } from '@/components/ui/progress';
import { Loader2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const STAGE_LABELS: Record<string, string> = {
  checking: 'Verificando',
  downloading: 'Baixando',
  extracting: 'Extraindo',
  creating_venv: 'Criando ambiente virtual',
  installing_pip: 'Instalando pip',
  copying_scripts: 'Copiando scripts',
  installing_deps: 'Instalando dependências',
  validating: 'Validando',
  done: 'Concluído',
};

export function PythonBootstrapProgress() {
  const bootstrap = usePythonBootstrap();

  // Se estiver completo e sem erro, não mostrar nada
  if (bootstrap.isComplete && !bootstrap.error) {
    return null;
  }

  // Se houver erro, mostrar alerta
  if (bootstrap.error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="w-full max-w-md mx-4">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" />
                Erro no Bootstrap do Python
              </CardTitle>
              <CardDescription>
                O aplicativo não pode funcionar sem o runtime Python
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-destructive/10 p-3">
                <p className="text-sm text-destructive font-medium">{bootstrap.error}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Por favor, reinicie o aplicativo ou verifique os logs para mais detalhes.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Mostrar progresso durante bootstrap
  const stageLabel = STAGE_LABELS[bootstrap.stage] || bootstrap.stage;
  const progressValue = bootstrap.progress ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Inicializando Python Runtime
            </CardTitle>
            <CardDescription>
              Configurando ambiente Python para scraping web
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{stageLabel}</span>
                {bootstrap.progress !== null && (
                  <span className="text-muted-foreground">{Math.round(progressValue * 100)}%</span>
                )}
              </div>
              
              {bootstrap.progress !== null && (
                <Progress value={progressValue * 100} className="h-2" />
              )}
              
              <p className="text-sm text-muted-foreground mt-2">
                {bootstrap.message}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

