'use client';

import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Cpu, Monitor, Zap, Laptop } from "lucide-react";
import { GpuInfo } from "@/lib/recommendation";
import { useSettingsStore } from "@/store/settings-store";
import { cn } from "@/lib/utils";

interface GpuSelectorProps {
  gpus: GpuInfo[];
}

export function GpuSelector({ gpus }: GpuSelectorProps) {
  const selectedGpu = useSettingsStore((state) => state.selectedGpu);
  const setSelectedGpu = useSettingsStore((state) => state.setSelectedGpu);

  // Se não há GPUs ou apenas uma, não mostrar seletor
  if (gpus.length === 0) {
    return null;
  }

  // Se há apenas uma GPU, selecionar automaticamente
  if (gpus.length === 1 && !selectedGpu) {
    setSelectedGpu(gpus[0].id);
  }

  // Selecionar primeira GPU por padrão se nenhuma estiver selecionada
  useEffect(() => {
    if (!selectedGpu && gpus.length > 0) {
      setSelectedGpu(gpus[0].id);
    }
  }, [selectedGpu, gpus, setSelectedGpu]);

  const getVendorIcon = (vendor: string | null) => {
    const iconClass = "h-5 w-5";
    switch (vendor?.toUpperCase()) {
      case 'NVIDIA':
        return <Zap className={cn(iconClass, "text-green-500")} />;
      case 'AMD':
        return <Zap className={cn(iconClass, "text-red-500")} />;
      case 'INTEL':
        return <Cpu className={cn(iconClass, "text-blue-500")} />;
      case 'APPLE':
        return <Monitor className={cn(iconClass, "text-gray-500")} />;
      default:
        return <Monitor className={cn(iconClass, "text-muted-foreground")} />;
    }
  };

  const formatMemory = (memoryMb: number | null) => {
    if (!memoryMb) return null;
    if (memoryMb >= 1024) {
      return `${(memoryMb / 1024).toFixed(1)} GB`;
    }
    return `${memoryMb} MB`;
  };

  return (
    <Card className="w-full max-w-2xl mx-auto bg-muted/30 animate-in fade-in slide-in-from-bottom-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Monitor className="text-primary" />
          Placas de Vídeo Detectadas
        </CardTitle>
        <CardDescription>
          Selecione qual GPU você deseja usar para processamento de IA
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {gpus.map((gpu) => {
            const isSelected = selectedGpu === gpu.id;
            const memoryStr = formatMemory(gpu.memory_mb);
            
            return (
              <button
                key={gpu.id}
                onClick={() => setSelectedGpu(gpu.id)}
                className={cn(
                  "relative p-4 rounded-lg border-2 transition-all text-left",
                  "hover:border-primary/50 hover:bg-accent/50",
                  isSelected
                    ? "border-primary bg-primary/10 shadow-md"
                    : "border-border bg-background"
                )}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-4 w-4 text-primary-foreground" />
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      {getVendorIcon(gpu.vendor)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{gpu.name}</h3>
                      {gpu.vendor && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          {gpu.vendor}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {memoryStr && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Cpu className="h-3 w-3" />
                      <span>{memoryStr} VRAM</span>
                    </div>
                  )}
                  
                  {!memoryStr && gpu.vendor && (
                    <div className="text-xs text-muted-foreground">
                      {gpu.vendor === 'Intel' ? 'GPU Integrada' : 'GPU Dedicada'}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        
        {gpus.length === 1 && (
          <p className="text-sm text-muted-foreground mt-4 text-center">
            Apenas uma GPU foi detectada e será usada automaticamente.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

