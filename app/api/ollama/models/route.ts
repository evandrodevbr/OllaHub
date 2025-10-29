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
    let models: any[] = [];
    // Tentar garantir disponibilidade rapidamente (não bloquear longamente a UI)
    await ensureOllamaAvailable({ timeoutMs: 3000 }).catch(() => {});
    try {
      models = await listModelsViaSdk();
    } catch {
      models = await listModelsViaHttp();
    }
    const normalized = models.map((m) => normalizeModel(m));
    return NextResponse.json({ offline: false, models: normalized });
  } catch (e) {
    return NextResponse.json({ offline: true, models: mockModels });
  }
}
