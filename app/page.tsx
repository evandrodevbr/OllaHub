'use client';

import { useOllamaCheck } from "@/hooks/use-ollama-check";
import { Hero } from "@/components/landing/hero";
import { InstallModal } from "@/components/modals/install-modal";
import { StoppedCard } from "@/components/landing/stopped-card";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Home() {
  const { status, check } = useOllamaCheck();
  const router = useRouter();

  const handleStart = () => {
    const setupComplete = localStorage.getItem("ollahub_setup_complete");
    if (setupComplete) {
      router.push("/chat");
    } else {
      router.push("/setup");
    }
  };

  if (status === 'checking') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Verificando sistema...</span>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background text-foreground transition-colors duration-300">
      
      {/* Layout for Running State */}
      {status === 'running' && (
        <Hero onStart={handleStart} />
      )}

      {/* Layout for Stopped State */}
      {status === 'installed_stopped' && (
        <div className="flex flex-col items-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold tracking-tighter">OllaHub</h1>
              <p className="text-muted-foreground">Detectamos o Ollama, mas ele não está rodando.</p>
           </div>
           <StoppedCard onCheckAgain={check} />
        </div>
      )}

      {/* Layout for Not Installed State (Background + Modal) */}
      {status === 'not_installed' && (
        <>
          <div className="opacity-20 pointer-events-none blur-sm">
             <Hero onStart={() => {}} /> 
          </div>
          {/* Hero is shown in background, modal is open */}
          <InstallModal 
            open={true} 
            onCheckAgain={check} 
          />
        </>
      )}
    </main>
  );
}
