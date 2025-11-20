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
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CheckCircle2, XCircle, Loader2, Download, Trash2, Copy, ExternalLink, Plus, X, BookOpen, GraduationCap, Newspaper, Code, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Model {
  name: string;
  modified_at: string;
  size: number;
}

export default function SettingsPage() {
  const settings = useSettingsStore();
  const { toast } = useToast();
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [storagePath, setStoragePath] = useState<string>('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Load models and storage path on mount
  useEffect(() => {
    loadModels();
    loadStoragePath();
  }, [settings.ollamaUrl]);

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
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie as preferências do OllaHub
        </p>
      </div>

      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="ai">AI & Models</TabsTrigger>
          <TabsTrigger value="web">Web Search</TabsTrigger>
          <TabsTrigger value="sources">Sources & Knowledge</TabsTrigger>
          <TabsTrigger value="storage">Data & Storage</TabsTrigger>
        </TabsList>

        {/* Tab: AI & Models */}
        <TabsContent value="ai" className="space-y-6">
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
                <div className="flex gap-2">
                  <Input
                    id="ollama-url"
                    value={settings.ollamaUrl}
                    onChange={(e) => settings.setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                  />
                  <Button
                    onClick={checkConnection}
                    disabled={isCheckingConnection}
                    variant="outline"
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
                  <Select
                    value={settings.selectedModel}
                    onValueChange={settings.setSelectedModel}
                  >
                    <SelectTrigger id="model-select">
                      <SelectValue placeholder="Selecione um modelo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <div className="flex justify-between text-sm">
                    <span>1</span>
                    <span className="font-medium">{settings.webSearch.maxResults}</span>
                    <span>10</span>
                  </div>
                  <Slider
                    value={[settings.webSearch.maxResults]}
                    onValueChange={([value]) => settings.setWebSearchMaxResults(value)}
                    min={1}
                    max={10}
                    step={1}
                    disabled={!settings.webSearch.enabled}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeout">Timeout (segundos)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min={5}
                  max={30}
                  value={settings.webSearch.timeout}
                  onChange={(e) => settings.setWebSearchTimeout(Number(e.target.value))}
                  disabled={!settings.webSearch.enabled}
                />
                <p className="text-xs text-muted-foreground">
                  Tempo máximo para carregar cada página
                </p>
              </div>

              <DomainTagsInput
                domains={settings.webSearch.excludedDomains}
                onAdd={settings.addExcludedDomain}
                onRemove={settings.removeExcludedDomain}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Sources & Knowledge */}
        <TabsContent value="sources" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Fontes de Conhecimento</CardTitle>
              <CardDescription>
                Configure categorias de busca e sites customizados para pesquisa avançada
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Performance Settings */}
              <div className="space-y-4 pb-4 border-b">
                <div className="space-y-2">
                  <Label htmlFor="max-concurrent">Abas Simultâneas (Performance)</Label>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>1</span>
                      <span className="font-medium">{settings.webSearch.maxConcurrentTabs}</span>
                      <span>10</span>
                    </div>
                    <Slider
                      value={[settings.webSearch.maxConcurrentTabs]}
                      onValueChange={([value]) => settings.setWebSearchMaxConcurrentTabs(value)}
                      min={1}
                      max={10}
                      step={1}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Número máximo de páginas processadas simultaneamente (mais = mais rápido, mas mais uso de CPU)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="depth-research">Profundidade da Pesquisa</Label>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Rápido (5)</span>
                      <span className="font-medium">{settings.webSearch.totalSourcesLimit}</span>
                      <span>Profundo (40)</span>
                    </div>
                    <Slider
                      value={[settings.webSearch.totalSourcesLimit]}
                      onValueChange={([value]) => settings.setWebSearchTotalSourcesLimit(value)}
                      min={5}
                      max={40}
                      step={5}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Número total de fontes a buscar. Mais fontes = mais tempo, mas resultados mais completos.
                  </p>
                </div>
              </div>

              {/* Categories */}
              <div className="space-y-4">
                <Label>Categorias de Busca</Label>
                <div className="grid gap-4">
                  {settings.webSearch.categories.map((category) => {
                    const iconMap: Record<string, React.ReactNode> = {
                      academic: <GraduationCap className="w-4 h-4" />,
                      news: <Newspaper className="w-4 h-4" />,
                      tech: <Code className="w-4 h-4" />,
                      finance: <DollarSign className="w-4 h-4" />,
                    };
                    
                    return (
                      <Card key={category.id} className={category.enabled ? 'border-primary' : ''}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1">
                              <div className="mt-1">
                                {iconMap[category.id] || <BookOpen className="w-4 h-4" />}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Label htmlFor={`category-${category.id}`} className="font-semibold">
                                    {category.name}
                                  </Label>
                                  <Switch
                                    id={`category-${category.id}`}
                                    checked={category.enabled}
                                    onCheckedChange={() => settings.toggleCategory(category.id)}
                                  />
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {category.baseSites.map((site) => (
                                    <Badge key={site} variant="secondary" className="text-xs">
                                      {site}
                                    </Badge>
                                  ))}
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                  {category.baseSites.length} sites curados
                                </p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Custom Sites */}
              <div className="space-y-4 pt-4 border-t">
                <Label>Sites Customizados</Label>
                <p className="text-xs text-muted-foreground">
                  Adicione seus próprios domínios favoritos para busca direcionada
                </p>
                <div className="flex gap-2">
                  <Input
                    id="custom-site-input"
                    placeholder="exemplo.com"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const input = e.currentTarget;
                        const value = input.value.trim();
                        if (value) {
                          settings.addCustomSite(value);
                          input.value = '';
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const input = document.getElementById('custom-site-input') as HTMLInputElement;
                      const value = input?.value.trim();
                      if (value) {
                        settings.addCustomSite(value);
                        input.value = '';
                      }
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {settings.webSearch.userCustomSites.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {settings.webSearch.userCustomSites.map((site) => (
                      <Badge key={site} variant="outline" className="text-sm">
                        {site}
                        <button
                          onClick={() => settings.removeCustomSite(site)}
                          className="ml-2 hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Data & Storage */}
        <TabsContent value="storage" className="space-y-6">
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
                  <Label>Ações</Label>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleExportChats}
                      disabled={isExporting}
                      variant="outline"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Exportando...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Exportar Todos os Chats
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => setShowClearDialog(true)}
                      variant="destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Apagar Histórico
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Clear History Dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Todos os chats serão permanentemente removidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowClearDialog(false)}
              disabled={isClearing}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearHistory}
              disabled={isClearing}
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

