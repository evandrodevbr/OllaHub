'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, Square, RefreshCw, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { McpJsonEditor } from '@/components/chat/mcp-json-editor';

interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

interface McpServerStatus {
  name: string;
  status: 'running' | 'stopped' | 'error';
  pid?: number;
}

export function McpConfigPanel() {
  const [config, setConfig] = useState<McpConfig>({ mcpServers: {} });
  const [statuses, setStatuses] = useState<McpServerStatus[]>([]);
  const [configJson, setConfigJson] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [configPath, setConfigPath] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
    loadStatus();
    loadConfigPath();
    
    // Refresh status every 5 seconds
    const interval = setInterval(() => {
      loadStatus();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const loadedConfig = await invoke<any>('load_mcp_config');
      // Convert from Rust HashMap to TypeScript Record
      // Always ensure minimum structure: { mcpServers: {} }
      const config: McpConfig = {
        mcpServers: loadedConfig.mcp_servers || loadedConfig.mcpServers || {}
      };
      setConfig(config);
      setConfigJson(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Failed to load MCP config:', error);
      // On error, set minimum structure
      const minConfig: McpConfig = { mcpServers: {} };
      setConfig(minConfig);
      setConfigJson(JSON.stringify(minConfig, null, 2));
      toast({
        title: 'Erro',
        description: 'Falha ao carregar configuração MCP',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadStatus = async () => {
    try {
      const serverStatuses = await invoke<McpServerStatus[]>('list_mcp_server_status');
      setStatuses(serverStatuses);
    } catch (error) {
      console.error('Failed to load MCP status:', error);
    }
  };

  const loadConfigPath = async () => {
    try {
      const path = await invoke<string>('get_mcp_config_path_command');
      setConfigPath(path);
    } catch (error) {
      console.error('Failed to load config path:', error);
    }
  };

  const saveConfig = async () => {
    try {
      setIsSaving(true);
      
      // Trim whitespace from JSON string
      const trimmedJson = configJson.trim();
      
      // Validate JSON structure
      if (!trimmedJson) {
        toast({
          title: 'Erro',
          description: 'JSON vazio. Por favor, insira uma configuração válida.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      let parsedConfig: McpConfig;
      try {
        parsedConfig = JSON.parse(trimmedJson);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Erro desconhecido ao fazer parse do JSON';
        console.error('JSON parse error:', e);
        toast({
          title: 'Erro de JSON',
          description: `JSON inválido: ${errorMessage}`,
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      // Validate required structure
      if (!parsedConfig || typeof parsedConfig !== 'object') {
        toast({
          title: 'Erro',
          description: 'Configuração inválida: deve ser um objeto JSON.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      // Ensure mcpServers exists and is an object
      if (!parsedConfig.mcpServers || typeof parsedConfig.mcpServers !== 'object') {
        parsedConfig.mcpServers = {};
      }

      // Always ensure minimum structure: { mcpServers: {} }
      const normalizedConfig: McpConfig = {
        mcpServers: parsedConfig.mcpServers || {}
      };

      // The Rust struct uses serde(rename = "mcpServers") so we can pass it directly
      // No need to convert mcpServers to mcp_servers
      await invoke('save_mcp_config', { config: normalizedConfig });
      setConfig(normalizedConfig);
      // Update JSON to reflect normalized structure
      setConfigJson(JSON.stringify(normalizedConfig, null, 2));
      
      toast({
        title: 'Sucesso',
        description: 'Configuração MCP salva com sucesso',
      });
      
      // Reload status after saving
      loadStatus();
    } catch (error) {
      console.error('Failed to save MCP config:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast({
        title: 'Erro',
        description: `Falha ao salvar configuração MCP: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const startServer = async (name: string) => {
    try {
      const serverConfig = config.mcpServers[name];
      if (!serverConfig) {
        toast({
          title: 'Erro',
          description: `Servidor '${name}' não encontrado na configuração`,
          variant: 'destructive',
        });
        return;
      }

      await invoke('start_mcp_server', { name, config: serverConfig });
      toast({
        title: 'Sucesso',
        description: `Servidor '${name}' iniciado`,
      });
      loadStatus();
    } catch (error) {
      console.error('Failed to start server:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Erro ao Iniciar Servidor',
        description: errorMessage || `Falha ao iniciar servidor '${name}'`,
        variant: 'destructive',
      });
    }
  };

  const stopServer = async (name: string) => {
    try {
      await invoke('stop_mcp_server', { name });
      toast({
        title: 'Sucesso',
        description: `Servidor '${name}' parado`,
      });
      loadStatus();
    } catch (error) {
      console.error('Failed to stop server:', error);
      toast({
        title: 'Erro',
        description: `Falha ao parar servidor '${name}'`,
        variant: 'destructive',
      });
    }
  };

  const restartServer = async (name: string) => {
    try {
      await invoke('restart_mcp_server', { name });
      toast({
        title: 'Sucesso',
        description: `Servidor '${name}' reiniciado`,
      });
      loadStatus();
    } catch (error) {
      console.error('Failed to restart server:', error);
      toast({
        title: 'Erro',
        description: `Falha ao reiniciar servidor '${name}'`,
        variant: 'destructive',
      });
    }
  };

  const restartAll = async () => {
    try {
      const started = await invoke<string[]>('restart_all_mcp_servers');
      toast({
        title: 'Sucesso',
        description: `${started.length} servidor(es) iniciado(s)`,
      });
      loadStatus();
    } catch (error) {
      console.error('Failed to restart all servers:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao reiniciar servidores',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'running':
        return 'default';
      case 'stopped':
        return 'secondary';
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl font-semibold">MCP Servers</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie servidores Model Context Protocol
          </p>
          {configPath && (
            <p className="text-xs text-muted-foreground mt-1">
              Config: <code className="text-xs bg-muted px-1 py-0.5 rounded">{configPath}</code>
            </p>
          )}
        </div>
        <Button onClick={restartAll} size="sm" variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Reiniciar Todos
        </Button>
      </div>

      {/* Server Status List */}
      <div className="space-y-2 flex-shrink-0 overflow-y-auto">
        {Object.keys(config.mcpServers).length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center">
                Nenhum servidor MCP configurado. Adicione servidores no JSON abaixo.
              </p>
            </CardContent>
          </Card>
        ) : (
          Object.keys(config.mcpServers).map((name) => {
            const status = statuses.find(s => s.name === name);
            const isRunning = status?.status === 'running';

            return (
              <Card key={name}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{name}</CardTitle>
                      {status && (
                        <Badge variant={getStatusBadgeVariant(status.status)}>
                          {status.status}
                        </Badge>
                      )}
                      {status?.pid && (
                        <span className="text-xs text-muted-foreground">
                          PID: {status.pid}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {isRunning ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => stopServer(name)}
                          >
                            <Square className="w-3 h-3 mr-1" />
                            Parar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => restartServer(name)}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Reiniciar
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startServer(name)}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Iniciar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="text-muted-foreground">Comando:</span>{' '}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {config.mcpServers[name].command} {config.mcpServers[name].args.join(' ')}
                      </code>
                    </div>
                    {config.mcpServers[name].env && (
                      <div>
                        <span className="text-muted-foreground">Env:</span>{' '}
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {Object.keys(config.mcpServers[name].env || {}).join(', ')}
                        </code>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* JSON Editor */}
      <Card className="flex flex-col flex-1 min-h-0 max-w-full overflow-hidden">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="text-base">Configuração JSON</CardTitle>
          <CardDescription className="truncate">
            Edite a configuração MCP no formato JSON padrão
          </CardDescription>
          <CardAction>
            <Button onClick={saveConfig} disabled={isSaving} size="sm">
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 max-w-full overflow-hidden">
          <McpJsonEditor
            value={configJson}
            onChange={setConfigJson}
            placeholder='{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]\n    }\n  }\n}'
            className="flex-1 max-w-full h-full"
          />
        </CardContent>
      </Card>
    </div>
  );
}

