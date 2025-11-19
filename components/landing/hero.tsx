import { Button } from "@/components/ui/button";
import { ArrowRight, Cpu } from "lucide-react";

export function Hero({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="p-4 rounded-full bg-primary/10 animate-pulse">
        <Cpu className="w-12 h-12 text-primary" />
      </div>
      <h1 className="text-4xl md:text-6xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
        OllaHub
      </h1>
      <p className="text-lg md:text-xl text-muted-foreground max-w-[600px]">
        Sua interface moderna e poderosa para interagir com Ollama e Modelos de Linguagem Locais.
      </p>
      
      <div className="flex gap-4 pt-4">
        <Button size="lg" onClick={onStart} className="group text-lg px-8 h-12">
          Iniciar Chat
          <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}

