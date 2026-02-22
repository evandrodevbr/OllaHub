'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Search, Shield } from 'lucide-react';

interface SearchConfig {
  region: string;
  safe_search: string;
  max_results: number;
  enabled: boolean;
  log_search_content: boolean;
  retention_days: number;
}

export function SearchSettingsPanel() {
  const { toast } = useToast();
  const [config, setConfig] = useState<SearchConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const loadedConfig = await invoke<SearchConfig>('load_search_config_command');
      setConfig(loadedConfig);
    } catch (error) {
      console.error('Failed to load Search config:', error);
      toast({
        title: 'Error loading configuration',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setIsSaving(true);
    try {
      await invoke('save_search_config_command', { config });
      toast({
        title: 'Configuration saved',
        description: 'Search settings have been updated successfully.',
      });
    } catch (error) {
      console.error('Failed to save Search config:', error);
      toast({
        title: 'Error saving configuration',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        Failed to load configuration.
        <Button variant="outline" className="ml-4" onClick={loadConfig}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                DuckDuckGo Search Integration
              </CardTitle>
              <CardDescription>
                Configure anonymous web search settings provided by DuckDuckGo.
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
                id="search-enabled"
              />
              <Label htmlFor="search-enabled">Enabled</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Select 
                value={config.region} 
                onValueChange={(val) => setConfig({ ...config, region: val })}
              >
                <SelectTrigger id="region">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wt-wt">Global (wt-wt)</SelectItem>
                  <SelectItem value="us-en">United States (us-en)</SelectItem>
                  <SelectItem value="uk-en">United Kingdom (uk-en)</SelectItem>
                  <SelectItem value="br-pt">Brazil (br-pt)</SelectItem>
                  <SelectItem value="de-de">Germany (de-de)</SelectItem>
                  <SelectItem value="fr-fr">France (fr-fr)</SelectItem>
                  <SelectItem value="es-es">Spain (es-es)</SelectItem>
                  <SelectItem value="it-it">Italy (it-it)</SelectItem>
                  <SelectItem value="jp-jp">Japan (jp-jp)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="safe-search" className="flex items-center gap-2">
                <Shield className="h-3 w-3" /> Safe Search
              </Label>
              <Select 
                value={config.safe_search} 
                onValueChange={(val) => setConfig({ ...config, safe_search: val })}
              >
                <SelectTrigger id="safe-search">
                  <SelectValue placeholder="Select safe search level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Strict (On)</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-results">Max Results</Label>
              <Input
                id="max-results"
                type="number"
                value={config.max_results}
                onChange={(e) => setConfig({ ...config, max_results: parseInt(e.target.value) || 10 })}
                min={1}
                max={50}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="retention">Log Retention (days)</Label>
              <Input
                id="retention"
                type="number"
                value={config.retention_days}
                onChange={(e) => setConfig({ ...config, retention_days: parseInt(e.target.value) || 30 })}
                min={1}
                max={365}
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-medium">Privacy</h3>
            <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <Label className="text-sm">Log Search Content</Label>
                <p className="text-xs text-muted-foreground">
                  Store query text in local history
                </p>
              </div>
              <Switch
                checked={config.log_search_content}
                onCheckedChange={(checked) => setConfig({ ...config, log_search_content: checked })}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
