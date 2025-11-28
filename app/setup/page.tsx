'use client';

import { useHardware } from "@/hooks/use-hardware";
import { HardwareScan } from "@/components/setup/hardware-scan";
import { GpuSelector } from "@/components/setup/gpu-selector";
import { ModelSelector } from "@/components/setup/model-selector";
import { getRecommendation } from "@/lib/recommendation";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const { specs, loading, gpus } = useHardware();
  const router = useRouter();

  const handleComplete = () => {
    // Save setup state if needed
    localStorage.setItem("ollahub_setup_complete", "true");
    router.push("/chat");
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-2xl space-y-8 animate-in fade-in duration-700">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tighter">Configuração Inicial</h1>
          <p className="text-muted-foreground">Vamos preparar o ambiente ideal para você.</p>
        </div>

        <HardwareScan specs={specs} loading={loading} />

        {!loading && specs && gpus.length > 0 && (
          <div className="animate-in slide-in-from-bottom-8 duration-700 delay-200 fill-mode-backwards">
            <GpuSelector gpus={gpus} />
          </div>
        )}

        {!loading && specs && (
          <div className="animate-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-backwards">
            <ModelSelector 
              recommendation={getRecommendation(specs)} 
              onComplete={handleComplete}
            />
          </div>
        )}
      </div>
    </main>
  );
}

