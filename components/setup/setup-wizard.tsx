'use client';

import { useEffect } from 'react';
import { useSetupWizard } from '@/hooks/use-setup-wizard';
import { SystemCheckStep } from './system-check-step';
import { OllamaInstallStep } from './ollama-install-step';
import { ModelDownloadStep } from './model-download-step';
import { SetupCompleteStep } from './setup-complete-step';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const steps = [
  { id: 1, title: 'Verificação do Sistema', description: 'Analisando hardware' },
  { id: 2, title: 'Instalação do Ollama', description: 'Configurando engine' },
  { id: 3, title: 'Download do Modelo', description: 'Baixando modelo padrão' },
  { id: 4, title: 'Conclusão', description: 'Tudo pronto!' },
];

export function SetupWizard() {
  const { state, checkSetupState, goToStep, nextStep } = useSetupWizard();

  useEffect(() => {
    checkSetupState();
  }, [checkSetupState]);

  const handleNext = () => {
    nextStep();
  };

  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return <SystemCheckStep onNext={handleNext} />;
      case 2:
        return <OllamaInstallStep onNext={handleNext} />;
      case 3:
        return <ModelDownloadStep onNext={handleNext} />;
      case 4:
        return <SetupCompleteStep />;
      default:
        return <SystemCheckStep onNext={handleNext} />;
    }
  };
  const containerWidth = state.currentStep === 3 ? 'max-w-6xl' : 'max-w-2xl';

  return (
    <div className="h-screen max-h-screen w-full bg-background flex flex-col items-center overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className={`w-full ${containerWidth} flex-shrink-0 transition-all duration-500 ease-in-out space-y-4 sm:space-y-6 lg:space-y-8 py-4`}>
          <div className="text-center space-y-2 flex-shrink-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tighter">Configuração Inicial</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Vamos preparar o ambiente ideal para você começar a usar o OllaHub.
            </p>
          </div>

          <div className={`w-full ${containerWidth} mx-auto mb-20 sm:mb-24 md:mb-28 px-2 sm:px-0 transition-all duration-500 ease-in-out flex-shrink-0 relative z-0`}>
            <div className="flex items-center justify-between relative">
              {steps.map((step, index) => {
                const isCompleted = state.completedSteps.includes(step.id);
                const isCurrent = state.currentStep === step.id;
                const isFuture = !isCompleted && !isCurrent;
              
              const canNavigate = step.id <= state.currentStep;
              const maxReachableStep = Math.max(state.currentStep, ...state.completedSteps);
              const isClickable = canNavigate || step.id === maxReachableStep + 1;
              const isLineActive = state.currentStep > index + 1 || state.completedSteps.includes(step.id);

              return (
                <div key={step.id} className={cn("contents")}>
                  {/* STEP CIRCLE & LABEL */}
                  <div className="flex flex-col items-center relative z-0 group pb-0 md:pb-0">
                    <div
                      onClick={() => isClickable && step.id !== state.currentStep && goToStep(step.id)}
                      className={cn(
                        "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 relative z-0",
                        // Estética dos Círculos
                        isCompleted && "bg-emerald-500 border-emerald-500 text-white",
                        isCurrent && "bg-zinc-900 border-white text-white shadow-[0_0_10px_rgba(255,255,255,0.5)]",
                        isFuture && "bg-zinc-900 border-zinc-800 text-zinc-500",
                        // Interatividade
                        isClickable ? "cursor-pointer" : "cursor-default"
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                      ) : (
                        <span className="text-sm sm:text-base font-bold">{step.id}</span>
                      )}
                    </div>
                    
                    {/* Rótulos (Labels) - Desktop Only */}
                    <div className="hidden md:flex absolute top-14 flex-col items-center w-32 text-center z-10">
                        <span className={cn(
                            "text-sm font-medium transition-colors duration-300",
                            isCurrent ? "text-white" : "text-muted-foreground"
                        )}>
                            {step.title}
                        </span>
                    </div>
                  </div>

                  {/* LINHA CONECTORA (Entre passos) */}
                  {index < steps.length - 1 && (
                    <div className={cn(
                      "flex-1 h-[2px] mx-2 sm:mx-4 rounded transition-colors duration-500 relative z-0",
                      isLineActive ? "bg-emerald-500" : "bg-zinc-800"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
          </div>
          <div className="w-full flex-shrink-0 relative z-10">
            {renderStep()}
          </div>
        </div>
    </div>
  );
}
