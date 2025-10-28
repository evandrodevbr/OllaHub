export type Device = "CPU" | "GPU";

export type ModelInfo = {
  id: string;
  name: string;
  sizeGB: number;
  quantization: string;
  device: Device;
  estCpuUsagePct?: number;
  estVramGB?: number;
};

export const mockModels: ModelInfo[] = [
  {
    id: "llama3.1-8b-q4",
    name: "llama3.1:8b-q4",
    sizeGB: 4.8,
    quantization: "Q4",
    device: "CPU",
    estCpuUsagePct: 85,
    estVramGB: 0.0,
  },
  {
    id: "llama3.1-8b-q8",
    name: "llama3.1:8b-q8",
    sizeGB: 8.9,
    quantization: "Q8",
    device: "GPU",
    estCpuUsagePct: 20,
    estVramGB: 8,
  },
  {
    id: "mistral-7b-q4",
    name: "mistral:7b-q4",
    sizeGB: 4.1,
    quantization: "Q4",
    device: "CPU",
    estCpuUsagePct: 75,
    estVramGB: 0,
  },
  {
    id: "mistral-7b-q8",
    name: "mistral:7b-q8",
    sizeGB: 7.9,
    quantization: "Q8",
    device: "GPU",
    estCpuUsagePct: 18,
    estVramGB: 8,
  },
  {
    id: "qwen2.5-7b-q4",
    name: "qwen2.5:7b-q4",
    sizeGB: 4.2,
    quantization: "Q4",
    device: "CPU",
    estCpuUsagePct: 80,
    estVramGB: 0,
  },
  {
    id: "qwen2.5-7b-q8",
    name: "qwen2.5:7b-q8",
    sizeGB: 8.1,
    quantization: "Q8",
    device: "GPU",
    estCpuUsagePct: 22,
    estVramGB: 8,
  },
];

export function inferQuantization(nameOrDetails: string | unknown): string {
  const s =
    typeof nameOrDetails === "string" ? nameOrDetails.toLowerCase() : "";
  if (s.includes("q8")) return "Q8";
  if (s.includes("q5")) return "Q5";
  if (s.includes("q4")) return "Q4";
  return "Q?";
}

export function inferDevice(details?: unknown): Device {
  const s = typeof details === "string" ? details.toLowerCase() : "";
  if (s.includes("cuda") || s.includes("metal") || s.includes("gpu"))
    return "GPU";
  return "CPU";
}

export function estimateCpuVram(
  info: Pick<ModelInfo, "sizeGB" | "quantization" | "device">,
) {
  const q = info.quantization.toUpperCase();
  let cpuPct = 50;
  let vramGB = 0;
  if (info.device === "GPU") {
    vramGB = Math.max(4, Math.round(info.sizeGB));
    cpuPct = 20;
  } else {
    // heurística simples: quantizações mais baixas usam mais CPU
    cpuPct = q === "Q8" ? 60 : q === "Q5" ? 70 : 85;
  }
  return { cpuPct, vramGB };
}
