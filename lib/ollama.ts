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
    // Ollama não tem API oficial para buscar modelos remotos
    // Vamos usar uma lista conhecida de modelos populares
    const popularModels = [
      "llama3.2:1b",
      "llama3.2:3b",
      "llama3.2:11b",
      "llama3.2:70b",
      "llama3.1:8b",
      "llama3.1:70b",
      "llama3.1:405b",
      "qwen2.5:1.5b",
      "qwen2.5:3b",
      "qwen2.5:7b",
      "qwen2.5:14b",
      "qwen2.5:32b",
      "qwen2.5:72b",
      "qwen2:0.5b",
      "qwen2:1.5b",
      "qwen2:3b",
      "qwen2:7b",
      "qwen2:14b",
      "qwen2:32b",
      "qwen2:72b",
      "mistral:7b",
      "mixtral:8x7b",
      "mixtral:8x22b",
      "phi3:mini",
      "phi3:medium",
      "phi3:large",
      "gemma2:2b",
      "gemma2:9b",
      "gemma2:27b",
      "codellama:7b",
      "codellama:13b",
      "codellama:34b",
      "deepseek-coder:1.3b",
      "deepseek-coder:6.7b",
      "deepseek-coder:33b",
    ];

    // Filtrar por query se fornecida
    const filteredModels = query
      ? popularModels.filter((model) =>
          model.toLowerCase().includes(query.toLowerCase())
        )
      : popularModels;

    // Verificar quais já estão instalados
    const installedModels = await listModelsViaSdk();
    const installedNames = installedModels.map((m) => m.name);

    return filteredModels.map((modelName) => ({
      name: modelName,
      installed: installedNames.includes(modelName),
      remote: true,
    }));
  } catch (error) {
    console.error("Erro ao buscar modelos remotos:", error);
    return [];
  }
}
