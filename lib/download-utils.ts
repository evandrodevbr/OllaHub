import { invoke } from '@tauri-apps/api/core';

/**
 * URLs oficiais dos instaladores Ollama
 */
export const OLLAMA_DOWNLOAD_URLS = {
  windows: 'https://ollama.com/download/OllamaSetup.exe',
  mac: 'https://ollama.com/download/Ollama-darwin.zip',
  linux: 'https://ollama.com/install.sh',
} as const;

/**
 * Nomes dos arquivos de fallback locais
 */
export const LOCAL_INSTALLER_FILES = {
  windows: 'OllamaSetup.exe',
  mac: 'Ollama-darwin.zip',
  linux: 'install.sh',
} as const;

export type OS = 'windows' | 'mac' | 'linux';

/**
 * Verifica se a URL oficial está disponível
 */
export async function checkOfficialUrlAvailable(os: OS): Promise<boolean> {
  try {
    const url = OLLAMA_DOWNLOAD_URLS[os];
    return await invoke<boolean>('check_download_url', { url });
  } catch (error) {
    console.error('Erro ao verificar URL oficial:', error);
    return false;
  }
}

/**
 * Verifica se o instalador local existe
 */
export async function checkLocalInstallerExists(os: OS): Promise<boolean> {
  try {
    const filename = LOCAL_INSTALLER_FILES[os];
    const path = await invoke<string | null>('get_local_installer_path', { 
      filename 
    });
    return path !== null;
  } catch (error) {
    console.error('Erro ao verificar instalador local:', error);
    return false;
  }
}

/**
 * Faz download do instalador (oficial ou fallback)
 * Retorna o caminho do arquivo baixado
 */
export async function downloadInstaller(os: OS): Promise<string> {
  const url = OLLAMA_DOWNLOAD_URLS[os];
  const filename = LOCAL_INSTALLER_FILES[os];
  
  try {
    const filePath = await invoke<string>('download_installer', { 
      url,
      filename
    });
    return filePath;
  } catch (error) {
    throw new Error(`Falha ao baixar instalador: ${error}`);
  }
}

/**
 * Verifica se o instalador já foi baixado
 */
export async function getDownloadedInstallerPath(os: OS): Promise<string | null> {
  const filename = LOCAL_INSTALLER_FILES[os];
  try {
    const path = await invoke<string | null>('get_downloaded_installer_path', { 
      filename 
    });
    return path;
  } catch (error) {
    console.error('Erro ao verificar instalador baixado:', error);
    return null;
  }
}

/**
 * Executa o instalador baixado
 */
export async function runInstaller(filePath: string): Promise<void> {
  try {
    await invoke('run_installer', { filePath });
  } catch (error) {
    throw new Error(`Falha ao executar instalador: ${error}`);
  }
}

