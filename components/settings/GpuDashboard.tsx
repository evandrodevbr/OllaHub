'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Monitor, Thermometer, Zap, Fan, Cpu, HardDrive, Activity } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface GpuStats {
  id: string;
  name: string;
  vendor: string | null;
  vram_used_mb: number | null;
  vram_total_mb: number | null;
  vram_percent: number | null;
  compute_usage_percent: number | null;
  graphics_usage_percent: number | null;
  overall_usage_percent: number | null;
  temperature_celsius: number | null;
  temperature_max_celsius: number | null;
  power_watts: number | null;
  power_max_watts: number | null;
  fan_speed_rpm: number | null;
  fan_speed_percent: number | null;
  processes_count: number | null;
  driver_version: string | null;
  api: string | null;
}

interface GpuDashboardProps {
  gpuId?: string;
  pollInterval?: number; // em milissegundos, padrão 2000ms
}

export function GpuDashboard({ gpuId, pollInterval = 2000 }: GpuDashboardProps) {
  const [stats, setStats] = useState<GpuStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await invoke<GpuStats | null>('get_gpu_stats', { gpuId: gpuId || null });
        setStats(data);
        setError(null);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load GPU stats:', err);
        setError(err instanceof Error ? err.message : 'Erro ao carregar estatísticas da GPU');
        setIsLoading(false);
      }
    };

    loadStats();
    const interval = setInterval(loadStats, pollInterval);

    return () => clearInterval(interval);
  }, [gpuId, pollInterval]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Carregando estatísticas da GPU...
        </CardContent>
      </Card>
    );
  }

  if (error || !stats) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {error || 'GPU não detectada ou sem suporte para monitoramento detalhado'}
        </CardContent>
      </Card>
    );
  }

  const formatBytes = (mb: number | null): string => {
    if (!mb) return '-';
    if (mb < 1024) return `${mb} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const getStatusColor = (value: number | null, thresholds: { good: number; warning: number }): string => {
    if (!value) return 'bg-muted';
    if (value < thresholds.good) return 'bg-green-500';
    if (value < thresholds.warning) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTemperatureColor = (temp: number | null): string => {
    if (!temp) return 'text-muted-foreground';
    if (temp < 60) return 'text-green-500';
    if (temp < 80) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-4">
      {/* Card Principal da GPU */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              GPU
            </CardTitle>
            <div className="flex items-center gap-2">
              {stats.vendor && (
                <Badge variant="outline" className="text-xs">
                  {stats.vendor}
                </Badge>
              )}
              {stats.api && (
                <Badge variant="secondary" className="text-xs">
                  {stats.api}
                </Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate" title={stats.name}>
            {stats.name}
          </p>
          {stats.driver_version && (
            <p className="text-xs text-muted-foreground">Driver: {stats.driver_version}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* VRAM */}
          {stats.vram_total_mb && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3 h-3" />
                  Memória VRAM
                </span>
                <span className="font-medium">
                  {formatBytes(stats.vram_used_mb)} / {formatBytes(stats.vram_total_mb)}
                  {stats.vram_percent && ` (${stats.vram_percent.toFixed(1)}%)`}
                </span>
              </div>
              {stats.vram_percent !== null && (
                <Progress 
                  value={stats.vram_percent} 
                  className="h-2"
                />
              )}
            </div>
          )}

          {/* Uso de Processamento */}
          {stats.overall_usage_percent !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3 h-3" />
                  Uso de Processamento
                </span>
                <span className="font-medium">{stats.overall_usage_percent.toFixed(1)}%</span>
              </div>
              <Progress 
                value={stats.overall_usage_percent} 
                className="h-2"
              />
              {stats.compute_usage_percent !== null && stats.graphics_usage_percent !== null && (
                <div className="flex gap-2 text-[10px] text-muted-foreground">
                  <span>Compute: {stats.compute_usage_percent.toFixed(1)}%</span>
                  <span>Graphics: {stats.graphics_usage_percent.toFixed(1)}%</span>
                </div>
              )}
            </div>
          )}

          {/* Grid de Métricas */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* Temperatura */}
            {stats.temperature_celsius !== null && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Thermometer className="w-3 h-3" />
                  Temperatura
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-lg font-semibold ${getTemperatureColor(stats.temperature_celsius)}`}>
                    {stats.temperature_celsius.toFixed(0)}
                  </span>
                  <span className="text-xs text-muted-foreground">°C</span>
                  {stats.temperature_max_celsius && (
                    <span className="text-[10px] text-muted-foreground">
                      / {stats.temperature_max_celsius.toFixed(0)}°C
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Energia */}
            {stats.power_watts !== null && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Zap className="w-3 h-3" />
                  Energia
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-semibold">
                    {stats.power_watts.toFixed(1)}
                  </span>
                  <span className="text-xs text-muted-foreground">W</span>
                  {stats.power_max_watts && (
                    <span className="text-[10px] text-muted-foreground">
                      / {stats.power_max_watts.toFixed(1)}W
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Ventilador */}
            {(stats.fan_speed_percent !== null || stats.fan_speed_rpm !== null) && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Fan className="w-3 h-3" />
                  Ventilador
                </div>
                <div className="flex items-baseline gap-1">
                  {stats.fan_speed_percent !== null && (
                    <>
                      <span className="text-lg font-semibold">
                        {stats.fan_speed_percent.toFixed(0)}
                      </span>
                      <span className="text-xs text-muted-foreground">%</span>
                    </>
                  )}
                  {stats.fan_speed_rpm !== null && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({stats.fan_speed_rpm} RPM)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Processos */}
            {stats.processes_count !== null && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Activity className="w-3 h-3" />
                  Processos
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-semibold">
                    {stats.processes_count}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {stats.processes_count === 1 ? 'processo' : 'processos'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


