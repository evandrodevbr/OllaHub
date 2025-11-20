'use client';

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface McpServerInfo {
  name: string;
  status: 'running' | 'stopped' | 'error';
  pid?: number;
  toolCount?: number;
}

export function useMcpServers() {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const serverStatuses = await invoke<McpServerInfo[]>('list_mcp_server_status');
      
      // Get tool counts for each server
      const allTools = await invoke<Array<{ server_name: string; tool: any }>>('get_all_mcp_tools');
      
      // Count tools per server
      const toolCounts = new Map<string, number>();
      for (const toolInfo of allTools) {
        toolCounts.set(toolInfo.server_name, (toolCounts.get(toolInfo.server_name) || 0) + 1);
      }
      
      // Enrich server info with tool counts
      const enrichedServers = serverStatuses.map(server => ({
        ...server,
        toolCount: toolCounts.get(server.name) || 0,
      }));
      
      setServers(enrichedServers);
    } catch (err) {
      console.error('Failed to load MCP servers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load MCP servers');
      setServers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
    
    // Refresh servers every 10 seconds
    const interval = setInterval(() => {
      loadServers();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [loadServers]);

  // Get only running servers
  const getRunningServers = useCallback((): McpServerInfo[] => {
    return servers.filter(server => server.status === 'running');
  }, [servers]);

  return {
    servers,
    runningServers: getRunningServers(),
    isLoading,
    error,
    loadServers,
  };
}

