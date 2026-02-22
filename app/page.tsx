'use client';

<<<<<<< HEAD
import { TitleBar } from "@/components/titlebar";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, startTransition, useRef } from "react";
import { useSettingsStore } from "@/store/settings-store";
import { invoke } from "@tauri-apps/api/core";

export default function Home() {
=======
import { useSetupCheck } from "@/hooks/use-setup-check";
import { Hero } from "@/components/landing/hero";
import { InstallModal } from "@/components/modals/install-modal";
import { StoppedCard } from "@/components/landing/stopped-card";
import { WelcomeNotification } from "@/components/notifications/welcome-notification";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, startTransition } from "react";

export default function Home() {
  const { status, ollamaStatus, checkingStep, recheck } = useSetupCheck();
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
  const router = useRouter();
  const { setSetupCompleted } = useSettingsStore();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  
  // Refs para evitar loops e execuções múltiplas
  const hasCheckedRef = useRef(false);
  const isRedirectingRef = useRef(false);

<<<<<<< HEAD
  // Hydration check: aguardar Zustand carregar do localStorage
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Guarda de roteamento: verificação de integridade do Ollama + flag persistente
  // Prioridade: Integridade do Sistema > Flag de Setup
  useEffect(() => {
    if (!isHydrated) return;
    if (hasCheckedRef.current) return; // Proteção contra múltiplas execuções

    const performCheck = async () => {
      if (isRedirectingRef.current) return; // Evitar múltiplos redirecionamentos
      
      setIsChecking(true);
      
      try {
        // 1. Verificação Real do Sistema (Fonte da Verdade)
        const isOllamaIntact = await invoke<boolean>('verify_ollama_integrity_command');
        
        // Ler isSetupCompleted diretamente do store (não usar como dependência)
        const currentSetupStatus = useSettingsStore.getState().isSetupCompleted;
        
        if (!isOllamaIntact) {
          // Se o motor não existe, força o setup, não importa o que o storage diga
          console.warn("Integridade do Ollama falhou. Redirecionando para Setup.");
          
          if (!isRedirectingRef.current) {
            isRedirectingRef.current = true;
            // Resetar flag de setup se Ollama não está íntegro (ANTES de redirecionar)
            setSetupCompleted(false);
            
            // Pequeno delay para garantir que o estado seja persistido no localStorage
            await new Promise(resolve => setTimeout(resolve, 100));
            
      startTransition(() => {
              router.replace('/setup');
      });
    }
          return;
        }

        // 2. Verificação de Fluxo de UI (apenas se Ollama está OK)
        if (!isRedirectingRef.current) {
          isRedirectingRef.current = true;
          
          if (currentSetupStatus) {
      startTransition(() => {
              router.replace('/chat');
      });
    } else {
      startTransition(() => {
              router.replace('/setup');
      });
    }
        }
      } catch (e) {
        console.error("Falha crítica no check de inicialização", e);
        // Fallback seguro: sempre ir para setup em caso de erro
        if (!isRedirectingRef.current) {
          isRedirectingRef.current = true;
          setSetupCompleted(false);

          // Pequeno delay para garantir que o estado seja persistido no localStorage
          await new Promise(resolve => setTimeout(resolve, 100));
          
          startTransition(() => {
            router.replace('/setup');
          });
        }
      } finally {
        setIsChecking(false);
        hasCheckedRef.current = true; // Marcar como executado
      }
    };

    performCheck();
  }, [isHydrated, router, setSetupCompleted]);

  // Enquanto não hidratou ou está verificando, retornar skeleton simples
  if (!isHydrated || isChecking) {
    return (
      <div className="h-screen w-full bg-background overflow-hidden flex flex-col">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center pt-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-foreground">
                {!isHydrated ? 'Carregando...' : 'Verificando sistema...'}
              </span>
              <span className="text-xs text-muted-foreground">Aguarde um momento...</span>
            </div>
=======
  // Redirecionar automaticamente se tudo estiver pronto
  useEffect(() => {
    if (status === 'ready') {
      const setupComplete = localStorage.getItem("ollahub_setup_complete");
      
      // Se setup não foi marcado como completo, marcar agora
      if (!setupComplete) {
        localStorage.setItem("ollahub_setup_complete", "true");
      }
      
      // Redirecionar para chat imediatamente (startTransition já garante não-bloqueio)
      startTransition(() => {
        router.push("/chat");
      });
      
      return () => clearTimeout(timer);
    }
  }, [status, router]);

  const handleStart = () => {
    const setupComplete = localStorage.getItem("ollahub_setup_complete");
    if (setupComplete) {
      startTransition(() => {
        router.push("/chat");
      });
    } else {
      startTransition(() => {
        router.push("/setup");
      });
    }
  };

  // Mostrar loading durante verificação
  if (status === 'checking') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium text-foreground">{checkingStep}</span>
            <span className="text-xs text-muted-foreground">Aguarde um momento...</span>
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
          </div>
        </div>
      </div>
    );
  }

  // Após verificação, mostrar loading de redirecionamento (não deve aparecer por muito tempo)
  return (
<<<<<<< HEAD
    <div className="h-screen w-full bg-background overflow-hidden flex flex-col">
      <TitleBar />
      <div className="flex-1 flex items-center justify-center pt-8">
        <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium text-foreground">Redirecionando...</span>
            <span className="text-xs text-muted-foreground">Aguarde um momento...</span>
          </div>
        </div>
          </div>
    </div>
=======
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background text-foreground transition-colors duration-300">
      {/* Notificação de boas-vindas */}
      <WelcomeNotification />
      
      {/* Layout for Ready State - Redirecionamento automático */}
      {status === 'ready' && (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-foreground">Tudo pronto!</span>
              <span className="text-xs text-muted-foreground">Redirecionando para o chat...</span>
            </div>
          </div>
        </div>
      )}

      {/* Layout for Needs Setup State */}
      {status === 'needs_setup' && ollamaStatus === 'running' && (
        <Hero onStart={handleStart} />
      )}

      {/* Layout for Stopped State */}
      {status === 'needs_setup' && ollamaStatus === 'installed_stopped' && (
        <div className="flex flex-col items-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold tracking-tighter">OllaHub</h1>
              <p className="text-muted-foreground">Detectamos o Ollama, mas ele não está rodando.</p>
           </div>
           <StoppedCard onCheckAgain={recheck} />
        </div>
      )}

      {/* Layout for Not Installed State (Background + Modal) */}
      {status === 'needs_ollama' && (
        <>
          <div className="opacity-20 pointer-events-none blur-sm">
             <Hero onStart={() => {}} /> 
          </div>
          {/* Hero is shown in background, modal is open */}
          <InstallModal 
            open={true} 
            onCheckAgain={recheck} 
          />
        </>
      )}
    </main>
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
  );
}
