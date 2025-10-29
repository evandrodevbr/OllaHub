import { Ollama } from "ollama";
import os from "node:os";
import { spawn } from "node:child_process";
import { getCatalogModels } from "./catalog";

export const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

export async function listModelsViaSdk() {
  try {
    const client = new Ollama({ host: OLLAMA_HOST });
    const res = await client.list();
    return res?.models ?? [];
  } catch (e) {
    throw e;
  }
}

export async function listModelsViaHttp() {
  const url = `${OLLAMA_HOST}/api/tags`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Ollama HTTP error ${res.status}`);
  const data = await res.json();
  return data?.models ?? [];
}

async function isOllamaHealthy(): Promise<boolean> {
  try {
    await listModelsViaHttp();
    return true;
  } catch {
    return false;
  }
}

async function waitUntilHealthy(timeoutMs: number, intervalMs = 800): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isOllamaHealthy()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export async function ensureOllamaAvailable(options?: { timeoutMs?: number }): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 20000;
  if (await isOllamaHealthy()) return true;

  // Windows: tentar iniciar via PowerShell script (WSL-first fallback Windows)
  if (os.platform() === "win32") {
    try {
      const child = spawn(
        "powershell",
        [
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          "scripts/ensure-ollama.ps1",
        ],
        { stdio: "ignore", detached: true }
      );
      child.unref();
    } catch (e) {
      // Ignorar, tentaremos apenas aguardar
    }
  }

  // Aguardar saúde
  return await waitUntilHealthy(timeoutMs);
}

export async function chatWithStream(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: Record<string, unknown>,
  system?: string,
  tools?: Array<any>
) {
  const client = new Ollama({ host: OLLAMA_HOST });

  const chatOptions: any = {
    model,
    messages: system
      ? [{ role: "system", content: system }, ...messages]
      : messages,
    stream: true,
    options,
  };

  // Adicionar tools se fornecidos
  if (tools && tools.length > 0) {
    chatOptions.tools = tools;
  }

  return client.chat(chatOptions);
}

export async function pullModel(model: string) {
  const client = new Ollama({ host: OLLAMA_HOST });
  return client.pull({ model, stream: true });
}

export async function checkModelExists(modelName: string): Promise<boolean> {
  try {
    const models = await listModelsViaSdk();
    return models.some((model) => model.name === modelName);
  } catch (error) {
    console.error("Erro ao verificar modelos:", error);
    return false;
  }
}

export async function ensureModelExists(
  modelName: string,
  description?: string
): Promise<void> {
  const exists = await checkModelExists(modelName);
  if (!exists) {
    console.log(`📥 Baixando modelo ${modelName}...`);
    if (description) {
      console.log(`ℹ️  ${description}`);
    }

    const stream = await pullModel(modelName);
    let downloadedBytes = 0;
    let totalBytes = 0;
    let progress = 0;

    // Processar stream para mostrar progresso
    for await (const chunk of stream) {
      if (chunk.status === "downloading" && chunk.completed && chunk.total) {
        downloadedBytes = chunk.completed;
        totalBytes = chunk.total;
        progress = Math.round((downloadedBytes / totalBytes) * 100);

        // Criar barra de progresso visual
        const barLength = 20;
        const filledLength = Math.round((progress / 100) * barLength);
        const bar =
          "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

        // Mostrar progresso com informações
        const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(1);
        const totalMB = (totalBytes / 1024 / 1024).toFixed(1);

        process.stdout.write(
          `\r📥 ${modelName}: [${bar}] ${progress}% (${downloadedMB}MB/${totalMB}MB)`
        );
      } else if (chunk.status === "success") {
        console.log(`\n✅ Modelo ${modelName} baixado com sucesso!`);
        if (description) {
          console.log(
            `🎯 ${description.replace("será usado", "agora funciona")}`
          );
        }
        break;
      }
    }
  } else {
    console.log(`✅ Modelo ${modelName} já está disponível`);
  }
}

export async function deleteModel(modelName: string): Promise<void> {
  const client = new Ollama({ host: OLLAMA_HOST });
  await client.delete({ model: modelName });
}

export async function searchRemoteModels(query?: string): Promise<any[]> {
  try {
    const catalog = await getCatalogModels();

    // Normalizar pesquisa
    const q = (query || "").trim().toLowerCase();

    const filtered = q
      ? catalog.filter((m) => {
          const name = m.name?.toLowerCase() || "";
          const desc = m.description?.toLowerCase() || "";
          return name.includes(q) || desc.includes(q);
        })
      : catalog;

    // Modelos instalados
    const installedModels = await listModelsViaSdk();
    const installedNames = new Set(installedModels.map((m) => m.name));

    // Retorno no formato esperado pelo frontend
    return filtered.map((m) => ({
      name: m.name,
      description: m.description,
      installed: installedNames.has(m.name),
      remote: true,
    }));
  } catch (error) {
    console.error("Erro ao buscar modelos remotos:", error);
    return [];
  }
}
