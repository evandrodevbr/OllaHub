'use client';

import { useState, useCallback } from 'react';

interface Toast {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const showToast = useCallback(({ title, description, variant }: Toast) => {
    // Simple implementation using console and alert for now
    // Can be enhanced later with a proper toast component
    if (variant === 'destructive') {
      console.error(`[Toast] ${title}: ${description || ''}`);
      alert(`Erro: ${title}\n${description || ''}`);
    } else {
      console.log(`[Toast] ${title}: ${description || ''}`);
    }
  }, []);

  return {
    toast: showToast,
  };
}

