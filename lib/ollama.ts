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
    messages,
    stream: true,
    options,
    system,
  });
}

export async function pullModel(model: string) {
  const client = new Ollama({ host: OLLAMA_HOST });
  return client.pull({ model, stream: true });
}
