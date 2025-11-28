'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface StreamingIndicatorProps {
  isStreaming: boolean;
  className?: string;
}

export function StreamingIndicator({ isStreaming, className }: StreamingIndicatorProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isStreaming) {
      setDots('');
      return;
    }

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!isStreaming) return null;

  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground px-6 py-2", className)}>
      <div className="relative">
        <Sparkles className="w-3 h-3 text-primary animate-pulse" />
        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
      </div>
      <span>Streaming{dots}</span>
    </div>
  );
}

