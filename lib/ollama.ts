import { Ollama } from "ollama";

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

export async function chatWithStream(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: Record<string, unknown>,
  system?: string
) {
  const client = new Ollama({ host: OLLAMA_HOST });
  return client.chat({
    model,
    messages: system
      ? [...messages, { role: "system", content: system }]
      : messages,
    stream: true,
    options,
  });
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
          console.log(`🎯 ${description.replace("será usado", "agora funciona")}`);
        }
        break;
      }
    }
  } else {
    console.log(`✅ Modelo ${modelName} já está disponível`);
  }
}
