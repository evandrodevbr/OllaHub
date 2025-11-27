'use client';

import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const checkMaximized = async () => {
      try {
        const appWindow = getCurrentWindow();
        const maximized = await appWindow.isMaximized();
        if (isMounted) {
          setIsMaximized(maximized);
        }
      } catch (error) {
        console.error('Failed to check window state:', error);
      }
    };
    
    checkMaximized();
    
    // Listener para mudanças de estado
    const setupListener = async () => {
      try {
        const appWindow = getCurrentWindow();
        const unlisten = await appWindow.onResized(async () => {
          if (isMounted) {
            const maximized = await appWindow.isMaximized();
            setIsMaximized(maximized);
          }
        });
        
        return unlisten;
      } catch (error) {
        console.error('Failed to setup resize listener:', error);
        return null;
      }
    };
    
    let unlistenFn: (() => void) | null = null;
    setupListener().then(fn => {
      unlistenFn = fn;
    });

    return () => {
      isMounted = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  const handleMinimize = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    const appWindow = getCurrentWindow();
    if (isMaximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  };

  const handleClose = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.close();
  };

  return (
    <div 
      className="h-8 bg-sidebar border-b border-sidebar-border flex items-center justify-between select-none z-50 shrink-0"
      data-tauri-drag-region
    >
      {/* Área de arrasto com logo/título */}
      <div 
        className="flex items-center gap-2 px-4 h-full flex-1"
        data-tauri-drag-region
      >
        <span className="text-sm font-medium text-sidebar-foreground">
          OllaHub
        </span>
      </div>

      {/* Controles de janela */}
      <div className="flex items-center h-full">
        <button
          onClick={handleMinimize}
          className="h-full w-12 flex items-center justify-center hover:bg-sidebar-accent transition-colors"
          title="Minimizar"
        >
          <Minus className="w-4 h-4 text-sidebar-foreground" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-full w-12 flex items-center justify-center hover:bg-sidebar-accent transition-colors"
          title={isMaximized ? "Restaurar" : "Maximizar"}
        >
          <Square className={cn(
            "w-3.5 h-3.5 text-sidebar-foreground",
            isMaximized && "opacity-60"
          )} />
        </button>
        <button
          onClick={handleClose}
          className="h-full w-12 flex items-center justify-center hover:bg-destructive transition-colors"
          title="Fechar"
        >
          <X className="w-4 h-4 text-sidebar-foreground" />
        </button>
      </div>
    </div>
  );
}

