import { invoke } from '@tauri-apps/api/core';

/**
 * Envia logs do frontend para o terminal via Tauri
 * Use esta função em vez de console.log para ver logs no terminal
 */
export async function logToTerminal(level: 'info' | 'warn' | 'error' | 'debug', message: string) {
  try {
    await invoke('log_to_terminal', { level, message });
  } catch (error) {
    // Fallback para console se o comando falhar
    console[level](message);
  }
}

/**
 * Helper para logs com prefixo [Chat]
 */
export const chatLog = {
  info: (message: string) => logToTerminal('info', `[Chat] ${message}`),
  warn: (message: string) => logToTerminal('warn', `[Chat] ${message}`),
  error: (message: string) => logToTerminal('error', `[Chat] ${message}`),
  debug: (message: string) => logToTerminal('debug', `[Chat] ${message}`),
};

/**
 * Helper para logs com prefixo [DeepResearch]
 */
export const deepResearchLog = {
  info: (message: string) => logToTerminal('info', `[DeepResearch] ${message}`),
  warn: (message: string) => logToTerminal('warn', `[DeepResearch] ${message}`),
  error: (message: string) => logToTerminal('error', `[DeepResearch] ${message}`),
  debug: (message: string) => logToTerminal('debug', `[DeepResearch] ${message}`),
};




