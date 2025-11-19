import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Cpu, HardDrive, Laptop } from "lucide-react";
import { SystemSpecs } from "@/lib/recommendation";
import { useEffect, useState } from "react";

interface HardwareScanProps {
  specs: SystemSpecs | null;
  loading: boolean;
}

export function HardwareScan({ specs, loading }: HardwareScanProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setProgress((prev) => (prev >= 90 ? 90 : prev + 10));
      }, 150);
      return () => clearInterval(interval);
    } else {
      setProgress(100);
    }
  }, [loading]);

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="animate-pulse text-primary" />
            Analisando Hardware...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground text-center">
            Verificando memória e processador para recomendação ideal.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!specs) return null;

  const ramGB = (specs.total_memory / (1024 * 1024 * 1024)).toFixed(1);

  return (
    <Card className="w-full max-w-md mx-auto bg-muted/30 animate-in fade-in slide-in-from-bottom-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Laptop className="text-primary" />
          Sistema Detectado
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <div className="flex flex-col items-center p-3 bg-background rounded-lg border">
          <HardDrive className="w-6 h-6 mb-2 text-muted-foreground" />
          <span className="text-xl font-bold">{ramGB} GB</span>
          <span className="text-xs text-muted-foreground">RAM Total</span>
        </div>
        <div className="flex flex-col items-center p-3 bg-background rounded-lg border">
          <Cpu className="w-6 h-6 mb-2 text-muted-foreground" />
          <span className="text-xl font-bold">{specs.cpu_count}</span>
          <span className="text-xs text-muted-foreground">Núcleos CPU</span>
        </div>
      </CardContent>
    </Card>
  );
}

