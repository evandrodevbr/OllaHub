'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Server, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { McpServerInfo } from '@/hooks/use-mcp-servers';

interface McpServerSelectorProps {
  servers: McpServerInfo[];
  selectedServers: string[];
  onSelectionChange: (servers: string[]) => void;
  isLoading?: boolean;
  className?: string;
}

export function McpServerSelector({
  servers,
  selectedServers,
  onSelectionChange,
  isLoading = false,
  className,
}: McpServerSelectorProps) {
  const [open, setOpen] = useState(false);

  // Filter only running servers
const runningServers = servers.filter(s => s.status === 'running');

  const handleToggle = (serverName: string) => {
    if (selectedServers.includes(serverName)) {
      onSelectionChange(selectedServers.filter(s => s !== serverName));
    } else {
      onSelectionChange([...selectedServers, serverName]);
    }
  };

  const handleSelectAll = () => {
    if (selectedServers.length === runningServers.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(runningServers.map(s => s.name));
    }
  };

  const getButtonText = () => {
    if (selectedServers.length === 0) {
      return 'Servidores MCP';
    }
    if (selectedServers.length === 1) {
      return selectedServers[0];
    }
    return `${selectedServers.length} servidores`;
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-8 gap-2', className)}
          disabled={isLoading}
        >
          <Server className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{getButtonText()}</span>
          {selectedServers.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {selectedServers.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Servidores MCP</span>
          {selectedServers.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {selectedServers.length} selecionado{selectedServers.length !== 1 ? 's' : ''}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={selectedServers.length === runningServers.length && runningServers.length > 0}
          onCheckedChange={handleSelectAll}
          className="font-medium"
        >
          Selecionar Todos
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {runningServers.map((server) => (
          <DropdownMenuCheckboxItem
            key={server.name}
            checked={selectedServers.includes(server.name)}
            onCheckedChange={() => handleToggle(server.name)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
              <span>{server.name}</span>
            </div>
            {server.toolCount !== undefined && server.toolCount > 0 && (
              <Badge variant="outline" className="ml-2 h-5 px-1.5 text-xs">
                {server.toolCount}
              </Badge>
            )}
          </DropdownMenuCheckboxItem>
        ))}
        {runningServers.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            Nenhum servidor rodando
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

