'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useSetupWizard } from '@/hooks/use-setup-wizard';
import { useSettingsStore } from '@/store/settings-store';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ArrowRight, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import { startTransition } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function SetupCompleteStep() {
  const { state, goToStep } = useSetupWizard();
  const { setSetupCompleted } = useSettingsStore();
  const router = useRouter();
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const verifyAndComplete = async () => {
      try {
        setIsVerifying(true);
        setIntegrityError(null);
        
        // Verificar integridade ANTES de marcar como completo
        const isOllamaIntact = await invoke<boolean>('verify_ollama_integrity_command');
        
        if (!isOllamaIntact) {
          // Redirecionar silenciosamente para o passo de instalação do Ollama
          setIsVerifying(false);
          goToStep(2);
          return;
        }
        
        // Só definir flag e redirecionar se Ollama estiver íntegro
        setSetupCompleted(true);
        setIsVerifying(false);
        
        const timer = setTimeout(() => {
          startTransition(() => {
            router.replace('/chat');
          });
        }, 2000);
        
        return () => clearTimeout(timer);
      } catch {
        // Em caso de erro na verificação, redirecionar para instalação
        setIsVerifying(false);
        goToStep(2);
      }
    };
    
    verifyAndComplete();
  }, [setSetupCompleted, router, goToStep]);

  const handleGoToChat = async () => {
    try {
      // Verificar integridade antes de redirecionar manualmente também
      const isOllamaIntact = await invoke<boolean>('verify_ollama_integrity_command');
      
      if (!isOllamaIntact) {
        // Redirecionar para o passo de instalação do Ollama
        goToStep(2);
        return;
      }
      
      setSetupCompleted(true);
      startTransition(() => {
        router.replace('/chat');
      });
    } catch {
      // Em caso de erro na verificação, redirecionar para instalação
      goToStep(2);
    }
  };

  const handleGoToInstallation = () => {
    goToStep(2);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto border-zinc-800 bg-zinc-950/50 backdrop-blur-sm shadow-2xl">
      <CardHeader className="p-6 sm:p-8">
        <CardTitle className="text-2xl font-bold text-white flex items-center gap-2 mb-2">
            {isVerifying ? (
                 <Loader2 className="w-6 h-6 animate-spin shrink-0" />
            ) : integrityError ? (
                 <AlertCircle className="w-6 h-6 text-red-500 shrink-0" />
            ) : (
                 <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
            )}
            <span>
                {isVerifying ? 'Verificando Integridade' : 
                 integrityError ? 'Erro na Configuração' : 
                 'Configuração Completa'}
            </span>
        </CardTitle>
        <CardDescription className="text-zinc-400 mb-8 text-base">
            {isVerifying ? 'Validando instalação do Ollama...' : 
             integrityError ? 'Encontramos um problema.' : 
             'Tudo pronto para começar a usar o OllaHub.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="px-6 sm:px-8 pb-6 sm:pb-8 pt-0 space-y-6">
      {isVerifying ? (
        <div className="flex flex-col items-center justify-center py-6 sm:py-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-zinc-900/50 flex items-center justify-center border border-zinc-800">
            <CheckCircle2 className="w-8 h-8 text-zinc-700 animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Estamos verificando se o serviço Ollama está respondendo corretamente antes de liberar o acesso.
          </p>
        </div>
      ) : integrityError ? (
        <div className="flex flex-col items-center justify-center py-6 sm:py-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-950/20 flex items-center justify-center border border-red-900/50">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <div className="text-center space-y-2 max-w-md">
            <h3 className="font-semibold text-red-400">Falha na Verificação</h3>
            <p className="text-sm text-zinc-400">
              {integrityError}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-4 p-6 bg-emerald-950/10 rounded-xl border border-emerald-900/20">
            <div className="p-3 bg-emerald-500/10 rounded-lg shrink-0">
                <Sparkles className="w-6 h-6 text-emerald-500" />
            </div>
            <div className="space-y-1">
                <h3 className="font-semibold text-emerald-400 text-lg">Ambiente Configurado</h3>
                <p className="text-emerald-200/70 text-sm leading-relaxed">
                    Seu assistente de IA local está pronto. Você pode começar a conversar, gerar códigos ou analisar documentos agora mesmo.
                </p>
            </div>
          </div>

          <div className="space-y-3 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
            <p className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Resumo da Instalação:
            </p>
            <ul className="text-sm text-zinc-500 space-y-2 pl-6 list-disc marker:text-zinc-700">
              <li>Hardware compatível detectado</li>
              {state.ollamaInstalled && <li>Ollama Engine instalado e ativo</li>}
              {state.modelDownloaded && (
                <li>Modelo de IA <strong>{state.modelName || 'padrão'}</strong> baixado</li>
              )}
            </ul>
          </div>
        </>
      )}
      </CardContent>

      <CardFooter className="flex justify-end p-6 sm:p-8 pt-6 mt-0 border-t border-zinc-800">
        <Button 
          onClick={integrityError ? handleGoToInstallation : handleGoToChat} 
          className="w-full sm:w-auto bg-white text-black hover:bg-zinc-200 h-12 px-8 text-base font-medium"
          disabled={isVerifying}
        >
          {isVerifying ? 'Verificando...' : integrityError ? 'Instalar Ollama' : 'Ir para o Chat'}
          {!isVerifying && !integrityError && <ArrowRight className="w-4 h-4 ml-2" />}
        </Button>
      </CardFooter>
    </Card>
  );
}


