'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Copy, Check, Terminal } from 'lucide-react';
import { ProblemSolution } from '@/lib/docker-problems';
import { useToast } from '@/hooks/use-toast';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';

interface DockerCommandsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problem: ProblemSolution | null;
}

export function DockerCommandsModal({ open, onOpenChange, problem }: DockerCommandsModalProps) {
  const { toast } = useToast();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!problem) return null;

  const handleCopyCommand = async (command: string, index: number) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedIndex(index);
      toast({
        title: 'Comando copiado',
        description: 'Comando copiado para a área de transferência',
      });
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar o comando',
        variant: 'destructive',
      });
    }
  };

  const handleOpenLink = async (url: string) => {
    try {
      await invoke('open_url', { url });
    } catch (error) {
      console.error('Error opening URL:', error);
      // Fallback para window.open se Tauri falhar
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6">
        <DialogHeader className="flex-shrink-0 pb-2 sm:pb-4">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
            <Terminal className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span className="break-words">{problem.problem}</span>
          </DialogTitle>
          {problem.description && (
            <DialogDescription className="text-xs sm:text-sm mt-1 sm:mt-2">
              {problem.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 overflow-y-auto flex-1 min-h-0 pr-1 -mr-1">
          {/* Links de Documentação */}
          {problem.links.length > 0 && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                  Documentação Oficial
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Links para documentação oficial sobre este problema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {problem.links.map((link, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className="w-full justify-start text-xs sm:text-sm h-9 sm:h-10"
                    onClick={() => handleOpenLink(link.url)}
                  >
                    <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 mr-2 shrink-0" />
                    <span className="truncate">{link.title}</span>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Comandos */}
          {problem.commands && problem.commands.length > 0 && (
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                  <Terminal className="w-3 h-3 sm:w-4 sm:h-4" />
                  Comandos
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Execute estes comandos no terminal para resolver o problema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                {problem.commands.map((command, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs sm:text-sm font-medium flex-1 break-words">{command.title}</h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyCommand(command.code, idx)}
                        className="h-7 sm:h-8 shrink-0 text-xs"
                      >
                        {copiedIndex === idx ? (
                          <>
                            <Check className="w-3 h-3 mr-1 text-green-500" />
                            <span className="hidden sm:inline">Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 mr-1" />
                            <span className="hidden sm:inline">Copiar</span>
                          </>
                        )}
                      </Button>
                    </div>
                    {command.description && (
                      <p className="text-xs text-muted-foreground">{command.description}</p>
                    )}
                    <div className="relative">
                      <pre className="bg-muted p-2 sm:p-3 md:p-4 rounded-lg overflow-x-auto text-xs sm:text-sm">
                        <code className="font-mono whitespace-pre-wrap break-all">{command.code}</code>
                      </pre>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Mensagem quando não há comandos nem links */}
          {problem.links.length === 0 && (!problem.commands || problem.commands.length === 0) && (
            <Card>
              <CardContent className="py-4 sm:py-6 text-center text-muted-foreground">
                <p className="text-xs sm:text-sm">Nenhuma solução disponível para este problema.</p>
                <p className="text-xs mt-2">
                  Consulte a documentação oficial do Docker para mais informações.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
