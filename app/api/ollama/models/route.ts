import { NextResponse } from "next/server";
import { listModelsViaSdk, listModelsViaHttp, ensureOllamaAvailable } from "@/lib/ollama";
import {
  estimateCpuVram,
  inferDevice,
  inferQuantization,
  mockModels,
  type ModelInfo,
} from "@/lib/models";

export const dynamic = "force-dynamic";

// Cache leve em memória para reduzir chamadas repetidas em curto intervalo
let __modelsCache: { ts: number; payload: any } | null = null;
const CACHE_TTL_MS = 8000; // 8s

function normalizeModel(model: any): ModelInfo {
  const name: string = model?.model || model?.name || "unknown";
  const sizeBytes: number = model?.size || 0;
  const sizeGB = Number(Math.max(0.1, sizeBytes / 1024 ** 3).toFixed(2));
  const quantization = inferQuantization(name);
  const device = inferDevice(model?.details || name);
  const { cpuPct, vramGB } = estimateCpuVram({ sizeGB, quantization, device });
  return {
    id: name,
    name,
    sizeGB,
    quantization,
    device,
    estCpuUsagePct: cpuPct,
    estVramGB: vramGB,
  };
}

export async function GET() {
  try {
    // Tentar retorno via cache recente
    if (__modelsCache && Date.now() - __modelsCache.ts < CACHE_TTL_MS) {
      return NextResponse.json(__modelsCache.payload);
    }

    let models: any[] = [];
    // Tentar garantir disponibilidade rapidamente (não bloquear longamente a UI)
    await ensureOllamaAvailable({ timeoutMs: 3000 }).catch(() => {});
    try {
      models = await listModelsViaSdk();
    } catch {
      models = await listModelsViaHttp();
    }
    const normalized = models.map((m) => normalizeModel(m));
    const payload = { offline: false, models: normalized };
    __modelsCache = { ts: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (e) {
    const payload = { offline: true, models: mockModels };
    __modelsCache = { ts: Date.now(), payload };
    return NextResponse.json(payload);
  }
}
