'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSettingsStore } from '@/store/settings-store';
import { DomainTagsInput } from '@/components/settings/domain-tags-input';
import { HardwareDashboard } from '@/components/settings/HardwareDashboard';
import { invoke } from '@tauri-apps/api/core';
import { CheckCircle2, XCircle, Loader2, Download, Trash2, Copy, ExternalLink, Plus, X, BookOpen, GraduationCap, Newspaper, Code, DollarSign, Edit, RotateCcw, Terminal, Power, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { SourcesConfig, SourceCategory } from '@/lib/types';

interface Model {
  name: string;
  modified_at: string;
  size: number;
}

export default function SettingsPage() {
  const settings = useSettingsStore();
  const { toast } = useToast();
  const router = useRouter();
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [storagePath, setStoragePath] = useState<string>('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SourceCategory | null>(null);
  const [isSavingSources, setIsSavingSources] = useState(false);
  const [recentLogs, setRecentLogs] = useState<string[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Load models, storage path, and sources config on mount
  useEffect(() => {
    loadModels();
    loadStoragePath();
    settings.fetchSources();
  }, [settings.ollamaUrl]);

  // Load logs periodically
  useEffect(() => {
    const loadLogs = async () => {
      try {
        setIsLoadingLogs(true);
        const logs = await invoke<string[]>('get_recent_logs', { lines: 100 });
        setRecentLogs(logs);
      } catch (error) {
        console.error('Failed to load logs:', error);
      } finally {
        setIsLoadingLogs(false);
      }
    };

    loadLogs();
    const interval = setInterval(loadLogs, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadModels = async () => {
    setIsLoadingModels(true);
    try {
      const response = await fetch(`${settings.ollamaUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        setAvailableModels(data.models || []);
      } else {
        setAvailableModels([]);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      setAvailableModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const loadStoragePath = async () => {
    try {
      const path = await invoke<string>('get_app_data_dir');
      setStoragePath(path);
    } catch (error) {
      console.error('Failed to load storage path:', error);
      setStoragePath('N/A');
    }
  };

  const checkConnection = async () => {
    setIsCheckingConnection(true);
    setConnectionStatus('idle');
    
    try {
      const response = await fetch(`${settings.ollamaUrl}/api/tags`, {
        method: 'HEAD',
      });
      
      if (response.ok) {
        setConnectionStatus('success');
        toast({
          title: 'Conexão bem-sucedida',
          description: 'Ollama está acessível neste endpoint.',
        });
        // Reload models after successful connection
        loadModels();
      } else {
        setConnectionStatus('error');
        toast({
          title: 'Erro de conexão',
          description: `Status: ${response.status}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      setConnectionStatus('error');
      toast({
        title: 'Erro de conexão',
        description: error instanceof Error ? error.message : 'Falha ao conectar',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const handleExportChats = async () => {
    setIsExporting(true);
    try {
      await invoke('export_chat_sessions');
      toast({
        title: 'Exportação concluída',
        description: 'Todos os chats foram exportados com sucesso.',
      });
    } catch (error) {
      console.error('Failed to export chats:', error);
      toast({
        title: 'Erro na exportação',
        description: error instanceof Error ? error.message : 'Falha ao exportar',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAllData = async () => {
    setIsExporting(true);
    try {
      const zipPath = await invoke<string>('export_all_data');
      toast({
        title: 'Backup completo exportado',
        description: `Arquivo salvo em: ${zipPath}`,
      });
    } catch (error) {
      console.error('Failed to export all data:', error);
      toast({
        title: 'Erro na exportação',
        description: error instanceof Error ? error.message : 'Falha ao exportar',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      await invoke('clear_chat_history');
      toast({
        title: 'Histórico apagado',
        description: 'Todas as conversas foram removidas.',
      });
      setShowClearDialog(false);
    } catch (error) {
      console.error('Failed to clear history:', error);
      toast({
        title: 'Erro ao apagar',
        description: error instanceof Error ? error.message : 'Falha ao apagar histórico',
        variant: 'destructive',
      });
    } finally {
      setIsClearing(false);
    }
  };

  const copyStoragePath = async () => {
    try {
      await navigator.clipboard.writeText(storagePath);
      toast({
        title: 'Caminho copiado',
        description: 'O caminho foi copiado para a área de transferência.',
      });
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  };

  return (
    <div className="container mx-auto py-4 sm:py-6 md:py-8 px-3 sm:px-4 md:px-6 max-w-4xl w-full overflow-x-hidden">
      <div className="mb-4 sm:mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold truncate">Configurações</h1>
            <p className="text-muted-foreground mt-1 sm:mt-2 text-sm sm:text-base">
              Gerencie as preferências do OllaHub
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/chat')}
            className="rounded-lg shrink-0"
            title="Fechar configurações"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1 sm:gap-2 h-auto">
          <TabsTrigger value="overview" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 truncate">
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="general" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 truncate">
            General
          </TabsTrigger>
          <TabsTrigger value="web" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 truncate">
            Web Search
          </TabsTrigger>
          <TabsTrigger value="sources" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 truncate">
            Sources
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 truncate">
            Tasks
          </TabsTrigger>
          <TabsTrigger value="system" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 truncate">
            System
          </TabsTrigger>
        </TabsList>

        {/* Tab: Visão Geral (Hardware Dashboard) */}
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dashboard de Hardware</CardTitle>
              <CardDescription>
                Monitoramento em tempo real do sistema (atualizado a cada 1 segundo)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HardwareDashboard />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: General */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Conexão Ollama</CardTitle>
              <CardDescription>
                Configure o endpoint do Ollama local
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ollama-url">Ollama Endpoint</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    id="ollama-url"
                    value={settings.ollamaUrl}
                    onChange={(e) => settings.setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="flex-1 min-w-0"
                  />
                  <Button
                    onClick={checkConnection}
                    disabled={isCheckingConnection}
                    variant="outline"
                    className="shrink-0"
                  >
                    {isCheckingConnection ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : connectionStatus === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : connectionStatus === 'error' ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      'Verificar'
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model-select">Modelo Padrão</Label>
                {isLoadingModels ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando modelos...
                  </div>
                ) : availableModels.length > 0 ? (
                  <TooltipProvider>
                    <Select
                      value={settings.selectedModel}
                      onValueChange={settings.setSelectedModel}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectTrigger id="model-select" className="min-w-0 max-w-full">
                            <SelectValue placeholder="Selecione um modelo..." className="truncate" />
                          </SelectTrigger>
                        </TooltipTrigger>
                        {settings.selectedModel && (
                          <TooltipContent side="top" className="max-w-[70vw] break-words">
                            <p className="text-sm">{settings.selectedModel}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                      <SelectContent className="max-w-[90vw]">
                        {availableModels.map((model) => (
                          <Tooltip key={model.name}>
                            <TooltipTrigger asChild>
                              <SelectItem value={model.name} className="min-w-0">
                                <span className="truncate block" style={{ maxWidth: '70vw' }}>
                                  {model.name}
                                </span>
                              </SelectItem>
                            </TooltipTrigger>
                            {model.name.length > 40 && (
                              <TooltipContent side="right" className="max-w-[70vw] break-words">
                                <p className="text-sm">{model.name}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ))}
                      </SelectContent>
                    </Select>
                  </TooltipProvider>
                ) : (
                  <Input
                    id="model-input"
                    value={settings.selectedModel}
                    onChange={(e) => settings.setSelectedModel(e.target.value)}
                    placeholder="Digite o nome do modelo..."
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Prompt</CardTitle>
              <CardDescription>
                Defina a personalidade e comportamento padrão da IA
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.systemPrompt}
                onChange={(e) => settings.setSystemPrompt(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
                placeholder="Você é um assistente útil..."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Context Window</CardTitle>
              <CardDescription>
                Tamanho máximo do contexto (tokens)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>2048</span>
                  <span className="font-medium">{settings.contextWindow.toLocaleString()}</span>
                  <span>32768</span>
                </div>
                <Slider
                  value={[settings.contextWindow]}
                  onValueChange={([value]) => settings.setContextWindow(value)}
                  min={2048}
                  max={32768}
                  step={512}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inicialização Automática</CardTitle>
              <CardDescription>
                Iniciar o OllaHub automaticamente ao iniciar o sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <Label htmlFor="autostart">Iniciar com o Sistema</Label>
                  <p className="text-xs text-muted-foreground">
                    O aplicativo será iniciado automaticamente ao fazer login
                  </p>
                </div>
                <Switch
                  id="autostart"
                  checked={settings.autoStart}
                  onCheckedChange={settings.toggleAutoStart}
                  className="shrink-0"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Web Search */}
        <TabsContent value="web" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Web Search</CardTitle>
              <CardDescription>
                Configure o sistema de busca e scraping na web
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="web-search-enabled">Ativar Web Search</Label>
                  <p className="text-xs text-muted-foreground">
                    Busca automática na web antes de responder
                  </p>
                </div>
                <Switch
                  id="web-search-enabled"
                  checked={settings.webSearch.enabled}
                  onCheckedChange={settings.setWebSearchEnabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-results">Máximo de Resultados</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Input
                      id="max-results"
                      type="number"
                      value={settings.webSearch.maxResults}
                      onChange={(e) => {
                        const v = parseInt(e.target.value || '0', 10);
                        const clamped = Math.min(100, Math.max(1, isNaN(v) ? 1 : v));
                        settings.setWebSearchMaxResults(clamped);
                      }}
                      className="w-20 sm:w-24 shrink-0"
                      min={1}
                      max={100}
                      disabled={!settings.webSearch.enabled}
                    />
                    <div className="flex-1 min-w-0">
                      <Slider
                        value={[settings.webSearch.maxResults]}
                        onValueChange={([value]) => settings.setWebSearchMaxResults(value)}
                        min={1}
                        max={100}
                        step={1}
                        disabled={!settings.webSearch.enabled}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1</span>
                    <span>100</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeout">Scraper Timeout (segundos)</Label>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>10s</span>
                    <span className="font-medium">{settings.webSearch.timeout / 1000}s</span>
                    <span>60s</span>
                  </div>
                  <Slider
                    value={[settings.webSearch.timeout / 1000]}
                    onValueChange={([value]) => settings.setWebSearchTimeout(value * 1000)}
                    min={10}
                    max={60}
                    step={5}
                    disabled={!settings.webSearch.enabled}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Tempo máximo para carregar cada página. Valores maiores podem resolver timeouts, mas aumentam o tempo total de busca.
                </p>
              </div>

              <DomainTagsInput
                domains={settings.webSearch.excludedDomains}
                onAdd={settings.addExcludedDomain}
                onRemove={settings.removeExcludedDomain}
              />
            </CardContent>
          </Card>

          {/* Card: Search Engines Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Motores de Busca</CardTitle>
              <CardDescription>
                Configure a ordem e comportamento dos motores de busca
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Ordem dos Motores</Label>
                <p className="text-xs text-muted-foreground">
                  Arraste para reordenar. O sistema tentará cada motor na ordem especificada até encontrar resultados suficientes.
                </p>
                <div className="space-y-2 border rounded-lg p-4">
                  {settings.webSearch.engineOrder.map((engine, index) => (
                    <div
                      key={engine}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {index + 1}
                        </Badge>
                        <span className="text-sm font-medium capitalize">{engine}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {index > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              const newOrder = [...settings.webSearch.engineOrder];
                              [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
                              settings.setWebSearchEngineOrder(newOrder);
                            }}
                          >
                            <ArrowLeft className="w-3 h-3" />
                          </Button>
                        )}
                        {index < settings.webSearch.engineOrder.length - 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              const newOrder = [...settings.webSearch.engineOrder];
                              [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                              settings.setWebSearchEngineOrder(newOrder);
                            }}
                          >
                            <ArrowLeft className="w-3 h-3 rotate-180" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="min-results-per-engine">Mínimo de Resultados por Motor</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Input
                      id="min-results-per-engine"
                      type="number"
                      value={settings.webSearch.minResultsPerEngine}
                      onChange={(e) => {
                        const v = parseInt(e.target.value || '1', 10);
                        const clamped = Math.min(10, Math.max(1, isNaN(v) ? 1 : v));
                        settings.setWebSearchMinResultsPerEngine(clamped);
                      }}
                      className="w-24"
                      min={1}
                      max={10}
                      disabled={!settings.webSearch.enabled}
                    />
                    <div className="flex-1">
                      <Slider
                        value={[settings.webSearch.minResultsPerEngine]}
                        onValueChange={([value]) => settings.setWebSearchMinResultsPerEngine(value)}
                        min={1}
                        max={10}
                        step={1}
                        disabled={!settings.webSearch.enabled}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Número mínimo de resultados para considerar um motor como bem-sucedido. Se um motor retornar menos resultados, o sistema tentará o próximo.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="semantic-expansion">Expansão Semântica de Queries</Label>
                  <p className="text-xs text-muted-foreground">
                    Adiciona sinônimos e variantes às queries para melhorar resultados
                  </p>
                </div>
                <Switch
                  id="semantic-expansion"
                  checked={settings.webSearch.enableSemanticExpansion}
                  onCheckedChange={settings.setWebSearchSemanticExpansion}
                  disabled={!settings.webSearch.enabled}
                />
              </div>

              {settings.webSearch.enableSemanticExpansion && (
                <div className="space-y-2">
                  <Label htmlFor="semantic-language">Idioma para Expansão Semântica</Label>
                  <Select
                    value={settings.webSearch.semanticExpansionLanguage}
                    onValueChange={settings.setWebSearchSemanticExpansionLanguage}
                    disabled={!settings.webSearch.enabled}
                  >
                    <SelectTrigger id="semantic-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Idioma usado para identificar stopwords e sinônimos durante a expansão semântica.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Sources & Knowledge */}
        <TabsContent value="sources" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Fontes de Conhecimento</CardTitle>
                  <CardDescription>
                    Configure categorias de busca salvas no sources.json (compartilhável)
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await settings.fetchSources();
                      toast({
                        title: 'Configuração recarregada',
                        description: 'Fontes atualizadas do arquivo sources.json',
                      });
                    } catch (error) {
                      toast({
                        title: 'Erro ao recarregar',
                        description: error instanceof Error ? error.message : 'Falha ao recarregar',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Recarregar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {settings.sourcesConfig ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Categorias de Busca</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (confirm('Mesclar categorias padrão curadas com sua configuração (sem duplicatas)?')) {
                          try {
                            const curated: SourcesConfig = {
                              version: 1,
                              last_updated: new Date().toISOString(),
                              categories: [
                                {
                                  id: 'academico',
                                  name: 'Acadêmico',
                                  base_sites: [
                                    'scholar.google.com', 'arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'ieee.org', 'acm.org',
                                    'sciencedirect.com', 'springer.com', 'jstor.org', 'researchgate.net', 'plos.org',
                                    'nature.com', 'sciencemag.org', 'mit.edu', 'phys.org', 'semanticscholar.org',
                                    'core.ac.uk', 'paperswithcode.com', 'base-search.net', 'doaj.org', 'worldscientific.com'
                                  ],
                                  enabled: true,
                                },
                                {
                                  id: 'tech',
                                  name: 'Tech',
                                  base_sites: [
                                    'stackoverflow.com', 'github.com', 'reddit.com/r/programming', 'dev.to', 'hackernoon.com',
                                    'tabnews.com.br', 'lobste.rs', 'news.ycombinator.com', 'hashnode.com', 'codesandbox.io',
                                    'developer.mozilla.org', 'web.dev', 'smashingmagazine.com', 'martinfowler.com', 'infoq.com',
                                    'dzone.com', 'freecodecamp.org', 'digitalocean.com', 'realpython.com', 'css-tricks.com'
                                  ],
                                  enabled: true,
                                },
                                {
                                  id: 'news',
                                  name: 'News',
                                  base_sites: [
                                    'theverge.com', 'techcrunch.com', 'arstechnica.com', 'engadget.com', 'wired.com',
                                    'venturebeat.com', 'cnet.com', 'mashable.com', 'gizmodo.com', 'zdnet.com',
                                    'tomshardware.com', 'anandtech.com', 'bleepingcomputer.com', 'theregister.com', '9to5mac.com',
                                    'androidauthority.com', 'techradar.com', 'fastcompany.com', 'g1.globo.com', 'techtudo.com.br'
                                  ],
                                  enabled: true,
                                },
                                {
                                  id: 'financeiro',
                                  name: 'Financeiro',
                                  base_sites: [
                                    'bloomberg.com', 'reuters.com', 'wsj.com', 'ft.com', 'cnbc.com',
                                    'marketwatch.com', 'economist.com', 'forbes.com', 'investopedia.com', 'seekingalpha.com',
                                    'infomoney.com.br', 'valor.globo.com', 'exame.com', 'braziljournal.com', 'coindesk.com',
                                    'cointelegraph.com', 'moneytimes.com.br', 'suno.com.br', 'b3.com.br', 'imf.org'
                                  ],
                                  enabled: true,
                                },
                              ],
                            };
                            if (!settings.sourcesConfig) {
                              await settings.saveSources(curated);
                            } else {
                              const merged: SourcesConfig = {
                                ...settings.sourcesConfig,
                                categories: settings.sourcesConfig.categories.map((existing) => {
                                  const cur = curated.categories.find(c => c.id === existing.id);
                                  if (!cur) return existing;
                                  const set = new Set<string>([...existing.base_sites, ...cur.base_sites].map(s => s.toLowerCase()));
                                  return { ...existing, base_sites: Array.from(set) } as any;
                                }),
                                last_updated: new Date().toISOString(),
                              };
                              await settings.saveSources(merged);
                            }
                            toast({
                              title: 'Fontes mescladas',
                              description: 'Categorias curadas foram mescladas sem duplicatas',
                            });
                          } catch (error) {
                            toast({
                              title: 'Erro ao mesclar',
                              description: error instanceof Error ? error.message : 'Falha ao mesclar categorias',
                              variant: 'destructive',
                            });
                          }
                        }
                    }}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Mesclar Padrões Curados
                  </Button>
                  </div>
                  <div className="grid gap-4">
                    {settings.sourcesConfig.categories.map((category) => {
                      const iconMap: Record<string, React.ReactNode> = {
                        academico: <GraduationCap className="w-4 h-4" />,
                        news: <Newspaper className="w-4 h-4" />,
                        tech: <Code className="w-4 h-4" />,
                        financeiro: <DollarSign className="w-4 h-4" />,
                      };
                      
                      return (
                        <Card key={category.id} className={category.enabled ? 'border-primary' : ''}>
                          <CardContent className="pt-4 sm:pt-6">
                            <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-0">
                              <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0 w-full">
                                <div className="mt-1 shrink-0">
                                  {iconMap[category.id] || <BookOpen className="w-4 h-4" />}
                                </div>
                                <div className="flex-1 min-w-0 overflow-hidden">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Label className="font-semibold truncate">{category.name}</Label>
                                    <Switch
                                      checked={category.enabled}
                                      onCheckedChange={async () => {
                                        const updated = {
                                          ...settings.sourcesConfig!,
                                          categories: settings.sourcesConfig!.categories.map((cat) =>
                                            cat.id === category.id ? { ...cat, enabled: !cat.enabled } : cat
                                          ),
                                        };
                                        try {
                                          await settings.saveSources(updated);
                                        } catch (error) {
                                          toast({
                                            title: 'Erro ao salvar',
                                            description: error instanceof Error ? error.message : 'Falha ao salvar',
                                            variant: 'destructive',
                                          });
                                        }
                                      }}
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {category.base_sites.map((site) => (
                                      <Badge key={site} variant="secondary" className="text-xs">
                                        {site}
                                      </Badge>
                                    ))}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {category.base_sites.length} sites
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingCategory(category)}
                                className="shrink-0"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                  <p>Carregando configuração de fontes...</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Edit Category Dialog */}
          <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
            <DialogContent className="max-w-[95vw] sm:max-w-2xl w-full">
              <DialogHeader>
                <DialogTitle>Editar Categoria: {editingCategory?.name}</DialogTitle>
                <DialogDescription>
                  Adicione ou remova sites desta categoria
                </DialogDescription>
              </DialogHeader>
              {editingCategory && (
                <EditCategoryDialog
                  category={editingCategory}
                  onSave={async (updatedCategory) => {
                    if (!settings.sourcesConfig) return;
                    const updated = {
                      ...settings.sourcesConfig,
                      categories: settings.sourcesConfig.categories.map((cat) =>
                        cat.id === updatedCategory.id ? updatedCategory : cat
                      ),
                    };
                    try {
                      setIsSavingSources(true);
                      await settings.saveSources(updated);
                      setEditingCategory(null);
                      toast({
                        title: 'Categoria atualizada',
                        description: 'Alterações salvas com sucesso',
                      });
                    } catch (error) {
                      toast({
                        title: 'Erro ao salvar',
                        description: error instanceof Error ? error.message : 'Falha ao salvar',
                        variant: 'destructive',
                      });
                    } finally {
                      setIsSavingSources(false);
                    }
                  }}
                />
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Tab: Tasks & Scheduler */}
        <TabsContent value="tasks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tarefas Agendadas</CardTitle>
              <CardDescription>
                Gerencie tarefas automáticas que executam em intervalos regulares
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Visualize e gerencie tarefas agendadas no Task Manager
                  </p>
                </div>
                <Button
                  onClick={() => router.push('/tasks')}
                  variant="outline"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Abrir Task Manager
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: System & Logs */}
        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Armazenamento</CardTitle>
              <CardDescription>
                Gerencie os dados salvos localmente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Localização dos Dados</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={storagePath}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyStoragePath}
                    title="Copiar caminho"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  As conversas são salvas como arquivos JSON neste diretório
                </p>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label>Backup e Manutenção</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={handleExportAllData}
                      disabled={isExporting}
                      variant="default"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Exportando...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Exportar Tudo (Backup Completo)
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleExportChats}
                      disabled={isExporting}
                      variant="outline"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Exportar Apenas Chats
                    </Button>
                    <Button
                      onClick={() => setShowClearDialog(true)}
                      variant="destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Apagar Histórico
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O backup completo inclui: chats, tasks.json, sources.json e settings.json
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logs do Sistema</CardTitle>
              <CardDescription>
                Visualize os logs recentes do aplicativo (atualizado a cada 5 segundos)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="bg-black text-green-400 font-mono text-xs p-4 rounded-lg h-[400px] overflow-y-auto">
                  {isLoadingLogs ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Carregando logs...
                    </div>
                  ) : recentLogs.length === 0 ? (
                    <div className="text-muted-foreground">Nenhum log disponível</div>
                  ) : (
                    recentLogs.map((line, idx) => (
                      <div key={idx} className="mb-1">
                        {line}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Processos do Sistema</CardTitle>
              <CardDescription>
                Gerencie processos do Chrome/Chromium que podem ficar "zumbis" após buscas web
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Chrome/Chromium Processes</Label>
                <p className="text-xs text-muted-foreground mb-4">
                  Se você notar processos Chrome "zumbis" consumindo memória após buscas web, use este botão para forçar o encerramento de todos os processos relacionados.
                </p>
                <Button
                  onClick={async () => {
                    try {
                      const killed = await invoke<number>('force_kill_browser');
                      toast({
                        title: killed > 0 ? 'Processos encerrados' : 'Nenhum processo encontrado',
                        description: killed > 0 
                          ? `${killed} processo(s) Chrome foram encerrados com sucesso.`
                          : 'Não há processos Chrome rodando no momento.',
                      });
                    } catch (error) {
                      console.error('Erro ao encerrar processos:', error);
                      toast({
                        title: 'Erro ao encerrar processos',
                        description: error instanceof Error ? error.message : 'Falha ao executar comando',
                        variant: 'destructive',
                      });
                    }
                  }}
                  variant="outline"
                  className="w-full"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Encerrar Processos Chrome
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Clear History Dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Todos os chats serão permanentemente removidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowClearDialog(false)}
              disabled={isClearing}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearHistory}
              disabled={isClearing}
              className="w-full sm:w-auto"
            >
              {isClearing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Apagando...
                </>
              ) : (
                'Confirmar Exclusão'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Edit Category Dialog Component
function EditCategoryDialog({ 
  category, 
  onSave 
}: { 
  category: SourceCategory; 
  onSave: (category: SourceCategory) => void;
}) {
  const [sites, setSites] = useState<string[]>(category.base_sites);
  const [newSite, setNewSite] = useState('');

  const handleAddSite = () => {
    const normalized = newSite.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (normalized && !sites.includes(normalized)) {
      setSites([...sites, normalized]);
      setNewSite('');
    }
  };

  const handleRemoveSite = (site: string) => {
    setSites(sites.filter((s) => s !== site));
  };

  const handleSave = () => {
    onSave({
      ...category,
      base_sites: sites,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Sites da Categoria</Label>
        <div className="flex gap-2">
          <Input
            placeholder="exemplo.com"
            value={newSite}
            onChange={(e) => setNewSite(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSite();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={handleAddSite}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {sites.map((site) => (
            <Badge key={site} variant="secondary" className="text-sm">
              {site}
              <button
                onClick={() => handleRemoveSite(site)}
                className="ml-2 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onSave(category)}>
          Cancelar
        </Button>
        <Button onClick={handleSave}>
          Salvar Alterações
        </Button>
      </DialogFooter>
    </div>
  );
}

