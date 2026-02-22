'use client';

<<<<<<< HEAD
import { SetupWizard } from '@/components/setup/setup-wizard';
import { TitleBar } from '@/components/titlebar';

export default function SetupPage() {
=======
import { useHardware } from "@/hooks/use-hardware";
import { HardwareScan } from "@/components/setup/hardware-scan";
import { GpuSelector } from "@/components/setup/gpu-selector";
import { ModelSelector } from "@/components/setup/model-selector";
import { getRecommendation } from "@/lib/recommendation";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

export default function SetupPage() {
  const { specs, loading, gpus } = useHardware();
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleComplete = () => {
    setIsNavigating(true);
    // Save setup state if needed
    localStorage.setItem("ollahub_setup_complete", "true");
    
    // Usar startTransition para navegação não-bloqueante
    startTransition(() => {
      router.push("/chat");
    });
  };

>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
  return (
    <div className="h-screen w-full bg-background overflow-hidden flex flex-col">
      <TitleBar />
      <SetupWizard />
    </div>
  );
}

