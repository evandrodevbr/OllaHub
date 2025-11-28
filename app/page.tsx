'use client';

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
  const router = useRouter();

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
          </div>
        </div>
      </div>
    );
  }

  return (
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
  );
}
