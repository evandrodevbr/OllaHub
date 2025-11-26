'use client';

import { useState, useEffect } from 'react';
import { X, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function WelcomeNotification() {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Verificar se já foi mostrado
    const welcomeShown = localStorage.getItem('ollahub_welcome_shown');
    if (!welcomeShown) {
      setShow(true);
      // Marcar como mostrado
      localStorage.setItem('ollahub_welcome_shown', 'true');
      // Auto-fechar após 5 segundos
      const timer = setTimeout(() => {
        setShow(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!mounted || !show) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md",
        "animate-in slide-in-from-top-5 fade-in duration-500"
      )}
    >
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg p-4 mx-4">
        <div className="flex items-start gap-3">
          <Heart className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-sm mb-1">
              Obrigado por usar o OllaHub! 🎉
            </h3>
            <p className="text-xs text-primary-foreground/90">
              Estamos felizes em tê-lo conosco. Comece a explorar e aproveite sua experiência!
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20 flex-shrink-0"
            onClick={() => setShow(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}





