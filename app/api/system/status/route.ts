import { NextResponse } from "next/server";
import os from "os";

export async function GET() {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const load = os.loadavg();
    const memUsage = process.memoryUsage();

    // Base com os/fallback
    const baseInfo: any = {
      os: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptimeSec: os.uptime(),
      },
      cpu: {
        model: os.cpus()?.[0]?.model || "unknown",
        cores: os.cpus()?.length || 0,
        speed: os.cpus()?.[0]?.speed || 0,
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        modules: [] as Array<{ size: number; clockSpeed?: number; type?: string }>,
      },
      gpus: [] as Array<{ index: number; name: string; vendor?: string; vramMB?: number; bus?: string }>,
      metrics: {
        loadAvg: { "1m": load[0] ?? 0, "5m": load[1] ?? 0, "15m": load[2] ?? 0 },
        process: {
          rss: memUsage.rss,
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
        },
      },
    };

    // Tentar usar systeminformation, se disponível
    try {
      // Import dinâmico sem acionar o bundler (evita Module not found)
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const dynImport: (m: string) => Promise<any> = new Function(
        "m",
        "return import(m)"
      ) as any;
      const si = await dynImport("systeminformation");

      const [cpu, osInfo, memLayout, graphics, currentLoad] = await Promise.all([
        si.cpu(),
        si.osInfo(),
        si.memLayout(),
        si.graphics(),
        si.currentLoad(),
      ]);

      baseInfo.os = {
        platform: osInfo.platform || baseInfo.os.platform,
        arch: os.arch(),
        release: osInfo.release || baseInfo.os.release,
        uptimeSec: baseInfo.os.uptimeSec,
        distro: osInfo.distro,
      };
      baseInfo.cpu = {
        model: cpu.brand || baseInfo.cpu.model,
        cores: cpu.cores || baseInfo.cpu.cores,
        physicalCores: cpu.physicalCores,
        speed: Number(cpu.speed) || baseInfo.cpu.speed,
      };
      baseInfo.memory.modules = (memLayout || []).map((m: any) => ({ size: m.size, clockSpeed: m.clockSpeed, type: m.type }));
      baseInfo.gpus = (graphics?.controllers || []).map((c: any, idx: number) => ({ index: idx, name: c.model || c.vendor || "GPU", vendor: c.vendor, vramMB: c.vram, bus: c.bus }));
      baseInfo.metrics.loadAvg = {
        "1m": currentLoad?.avgload ?? baseInfo.metrics.loadAvg["1m"],
        "5m": baseInfo.metrics.loadAvg["5m"],
        "15m": baseInfo.metrics.loadAvg["15m"],
      };
    } catch {
      // sem systeminformation, seguimos com fallback
    }

    // Fallback adicional para detectar GPUs no Windows via PowerShell
    try {
      if ((!baseInfo.gpus || baseInfo.gpus.length === 0) && (baseInfo.os.platform === "win32" || os.platform() === "win32")) {
        const { execFileSync } = await import("child_process");
        const out = execFileSync("powershell", [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,PNPDeviceID | ConvertTo-Json -Depth 3"
        ], { encoding: "utf8", timeout: 2000 });
        const parsed = JSON.parse(out);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        baseInfo.gpus = arr.map((g: any, idx: number) => ({ index: idx, name: g.Name || "GPU", vendor: undefined, vramMB: g.AdapterRAM ? Math.round(g.AdapterRAM / 1024 / 1024) : undefined, bus: g.PNPDeviceID }));
      }
    } catch {
      // ignore fallback errors
    }

    return NextResponse.json({ success: true, info: baseInfo });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}


