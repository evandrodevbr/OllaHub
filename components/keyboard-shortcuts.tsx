'use client';

import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function KeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CTRL+SHIFT+D para abrir devtools
      if (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        e.stopPropagation();
        invoke('toggle_devtools').catch(console.error);
        return;
      }

      // Bloquear F5 (refresh)
      if (e.key === 'F5') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Bloquear CTRL+R (refresh)
      if (e.ctrlKey && (e.key === 'r' || e.key === 'R') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Bloquear CTRL+SHIFT+R (hard refresh)
      if (e.ctrlKey && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Bloquear CTRL+SHIFT+I (devtools)
      if (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Bloquear CTRL+SHIFT+J (console)
      if (e.ctrlKey && e.shiftKey && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Bloquear CTRL+U (view source)
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Bloquear CTRL+SHIFT+DEL (clear storage)
      if (e.ctrlKey && e.shiftKey && e.key === 'Delete') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Bloquear CTRL+W (fechar aba - mas permitir fechar janela com o comportamento customizado do Tauri)
      // Não bloqueamos CTRL+W porque o Tauri já trata isso no on_window_event

      // Bloquear CTRL+N (nova janela)
      if (e.ctrlKey && (e.key === 'n' || e.key === 'N') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Bloquear CTRL+SHIFT+N (nova janela anônima)
      if (e.ctrlKey && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Bloquear CTRL+T (nova aba)
      if (e.ctrlKey && (e.key === 't' || e.key === 'T') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };

    // Adicionar listener com capture para interceptar antes de outros handlers
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  return null;
}

