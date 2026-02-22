'use client';

import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Progress } from '@/components/ui/progress';

interface LogLine {
  line: string;
  type: 'stdout' | 'stderr';
  progress?: number;
}

interface InstallationTerminalProps {
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export function InstallationTerminal({ onComplete, onError }: InstallationTerminalProps) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastProgressRef = useRef<number>(0);

  // Auto-scroll para última linha
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Escutar eventos de log
  useEffect(() => {
    const unlistenPromise = listen<LogLine>('install-log', (event) => {
      const logLine = event.payload;
      
      setLogs(prev => [...prev, logLine]);
      
      // Atualizar progresso se disponível
      if (logLine.progress !== undefined) {
        setProgress(logLine.progress);
        lastProgressRef.current = logLine.progress;
      } else {
        // Tentar extrair progresso da linha de texto
        const extractedProgress = extractProgressFromText(logLine.line);
        if (extractedProgress !== null) {
          setProgress(extractedProgress);
          lastProgressRef.current = extractedProgress;
        }
      }
      
      // Verificar se instalação foi concluída
      const lineLower = logLine.line.toLowerCase();
      if (lineLower.includes('success') || lineLower.includes('completed') || lineLower.includes('finished')) {
        setProgress(100);
        if (onComplete) {
          setTimeout(() => onComplete(), 500);
        }
      }
      
      // Verificar se houve erro
      if (logLine.type === 'stderr' && (lineLower.includes('error') || lineLower.includes('failed'))) {
        if (onError) {
          onError(logLine.line);
        }
      }
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [onComplete, onError]);

  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden max-h-[50vh] flex flex-col">
        <div className="px-2 sm:px-3 py-1.5 sm:py-2 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-500"></div>
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-yellow-500"></div>
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500"></div>
            <span className="text-[10px] sm:text-xs text-zinc-400 ml-1 sm:ml-2">Terminal</span>
          </div>
          {progress > 0 && (
            <span className="text-[10px] sm:text-xs text-zinc-400 font-mono shrink-0">{progress}%</span>
          )}
        </div>
        
        <div
          ref={scrollRef}
          className="h-48 sm:h-64 md:h-80 flex-1 min-h-0 overflow-y-auto p-2 sm:p-3 font-mono text-[10px] sm:text-xs"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#3f3f46 #18181b',
            scrollBehavior: 'smooth'
          }}
        >
          {logs.length === 0 ? (
            <div className="text-zinc-500 text-[10px] sm:text-xs">Aguardando logs...</div>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`
                  ${log.type === 'stderr' ? 'text-red-400' : 'text-green-400'}
                  whitespace-pre-wrap
                  break-words
                `}
              >
                {log.line}
              </div>
            ))
          )}
        </div>
      </div>
      
      {progress > 0 && (
        <div className="space-y-1">
          <Progress value={progress} className="h-1.5 sm:h-2" />
          <div className="text-[10px] sm:text-xs text-muted-foreground text-center">
            {progress < 100 ? `Instalando... ${progress}%` : 'Instalação concluída'}
          </div>
        </div>
      )}
    </div>
  );
}

/// Extrai progresso percentual de uma linha de texto
function extractProgressFromText(line: string): number | null {
  // Procurar por padrão "Progress: n%" ou "n%"
  const percentMatch = line.match(/(\d+)%/);
  if (percentMatch) {
    const num = parseInt(percentMatch[1], 10);
    if (num >= 0 && num <= 100) {
      return num;
    }
  }
  
  // Mapear keywords para progresso aproximado
  const lineLower = line.toLowerCase();
  if (lineLower.includes('downloading')) {
    return 25;
  } else if (lineLower.includes('installing')) {
    return 50;
  } else if (lineLower.includes('shim') || lineLower.includes('creating')) {
    return 75;
  } else if (lineLower.includes('finished') || lineLower.includes('completed') || lineLower.includes('success')) {
    return 100;
  }
  
  return null;
}
