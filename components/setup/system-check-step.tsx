'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Cpu, HardDrive, Zap, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useHardware } from '@/hooks/use-hardware';
import { cn } from '@/lib/utils';

// Componente Skeleton simples para loading
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse bg-zinc-900 rounded-xl', className)} />
  );
}

interface SystemCheckStepProps {
  onNext: () => void;
}

export function SystemCheckStep({ onNext }: SystemCheckStepProps) {
  const { specs, loading } = useHardware();

  const status = loading ? 'checking' : (specs ? 'success' : 'error');
  const ramGB = specs ? (specs.total_memory / (1024 * 1024 * 1024)).toFixed(1) : 0;
  const isCompatible = specs ? specs.total_memory >= 4 * 1024 * 1024 * 1024 : false; // Mínimo 4GB

  return (
    <Card className="w-full max-w-2xl mx-auto border-zinc-800 bg-zinc-950/50 backdrop-blur-sm shadow-2xl">
      <CardHeader className="p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-2xl font-bold text-white flex items-center gap-2 mb-2">
              <Zap className="w-6 h-6 text-emerald-500 shrink-0" />
              <span className="truncate">Verificação de Hardware</span>
            </CardTitle>
            <CardDescription className="text-zinc-400 mb-8 text-base">
              Analisando compatibilidade para execução de IA local.
            </CardDescription>
          </div>
          {status === 'success' && isCompatible && (
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 px-2 py-1 text-xs shrink-0">
              Compatível
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-6 sm:px-8 pb-6 sm:pb-8 pt-0 space-y-6">
        {/* Estado de Carregamento ou Grid de Specs */}
        {status === 'checking' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : specs ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {/* Card RAM */}
            <div className="p-4 sm:p-6 rounded-xl bg-zinc-900/50 border border-zinc-800 flex items-start gap-4 hover:border-zinc-700 transition-colors">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                <HardDrive className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-400">Memória RAM</p>
                <h3 className="text-2xl font-bold text-white mt-1">
                  {ramGB} <span className="text-sm font-normal text-zinc-500">GB</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-1">Mínimo recomendado: 16GB</p>
              </div>
            </div>

            {/* Card CPU */}
            <div className="p-4 sm:p-6 rounded-xl bg-zinc-900/50 border border-zinc-800 flex items-start gap-4 hover:border-zinc-700 transition-colors">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                <Cpu className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-400">Processador</p>
                <h3 className="text-2xl font-bold text-white mt-1">
                  {specs.cpu_count} <span className="text-sm font-normal text-zinc-500">Núcleos</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-1">Alta capacidade de threads</p>
              </div>
            </div>
          </motion.div>
        ) : null}

        {/* Feedback Visual */}
        <div className="pt-6">
          {status === 'checking' && (
            <p className="text-sm text-zinc-500 flex items-center gap-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-zinc-500 block" />
              Escaneando componentes...
            </p>
          )}
          
          {status === 'success' && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="flex items-start sm:items-center gap-3 text-sm text-emerald-400 bg-emerald-950/30 p-4 rounded-lg border border-emerald-900/50"
             >
               <CheckCircle2 className="w-5 h-5 shrink-0" />
               <span>Hardware detectado com sucesso. Pronto para instalar o Ollama.</span>
             </motion.div>
          )}

          {status === 'error' && (
             <div className="flex items-start sm:items-center gap-3 text-sm text-red-400 bg-red-950/30 p-4 rounded-lg border border-red-900/50">
               <AlertCircle className="w-5 h-5 shrink-0" />
               <span>Não foi possível detectar o hardware. Verifique as permissões.</span>
             </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex justify-end p-6 sm:p-8 pt-6 mt-0 border-t border-zinc-800">
        <Button 
          onClick={onNext} 
          disabled={status !== 'success'}
          className="w-full sm:w-auto bg-white text-black hover:bg-zinc-200 h-12 px-8 text-base font-medium"
        >
          {status === 'checking' ? 'Verificando...' : 'Continuar'}
          {status === 'success' && <ArrowRight className="w-4 h-4 ml-2" />}
        </Button>
      </CardFooter>
    </Card>
  );
}


