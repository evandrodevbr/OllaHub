'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Cpu, MemoryStick, HardDrive, Activity, Clock, Monitor } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { GpuDashboard } from './GpuDashboard';

interface SystemStats {
  cpu_usage: number;
  ram_used: number;
  ram_total: number;
  ram_percent: number;
  gpu_name: string | null;
  uptime: number;
  processes_count: number;
  cpu_name: string;
}

export function HardwareDashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await invoke<SystemStats>('get_system_stats');
        setStats(data);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load system stats:', error);
        setIsLoading(false);
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 1000); // Atualiza a cada 1 segundo

    return () => clearInterval(interval);
  }, []);

  if (isLoading || !stats) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Skeleton Cards */}
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-5 w-12 bg-muted animate-pulse rounded" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-2 w-full bg-muted animate-pulse rounded" />
                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Carregando estatísticas do sistema...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getCpuColor = (usage: number): string => {
    if (usage < 50) return 'bg-green-500';
    if (usage < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getRamColor = (percent: number): string => {
    if (percent < 60) return 'bg-blue-500';
    if (percent < 85) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* CPU Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              CPU
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {stats.cpu_usage.toFixed(1)}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress 
            value={stats.cpu_usage} 
            className="h-2"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate">{stats.cpu_name}</span>
          </div>
        </CardContent>
      </Card>

      {/* RAM Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MemoryStick className="w-4 h-4" />
              Memória RAM
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {stats.ram_percent.toFixed(1)}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress 
            value={stats.ram_percent} 
            className="h-2"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatBytes(stats.ram_used)} / {formatBytes(stats.ram_total)}</span>
            <span>{formatBytes(stats.ram_total - stats.ram_used)} livre</span>
          </div>
        </CardContent>
      </Card>

      {/* System Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2">
              <Clock className="w-3 h-3" />
              Uptime
            </span>
            <span className="font-medium">{formatUptime(stats.uptime)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Processos</span>
            <span className="font-medium">{stats.processes_count.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Visual RAM Usage */}
      <Card className="md:col-span-2 lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Uso de Memória
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Usado</span>
              <span className="font-medium">{stats.ram_percent.toFixed(1)}%</span>
            </div>
            <div className="relative h-24 bg-muted rounded-lg overflow-hidden">
              <div 
                className={`absolute bottom-0 left-0 right-0 ${getRamColor(stats.ram_percent)} transition-all duration-300`}
                style={{ height: `${stats.ram_percent}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                {formatBytes(stats.ram_used)} / {formatBytes(stats.ram_total)}
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* GPU Dashboard - Substitui o card simples */}
      <GpuDashboard pollInterval={2000} />
    </div>
  );
}

