"use client";

import { useState, useEffect, useRef } from "react";
import { Plug, ChevronDown, X, Zap } from "lucide-react";

interface MCPForChat {
  mcpId: string;
  name: string;
  toolCount: number;
  tools: Array<{ name: string; description: string }>;
}

interface MCPSelectorProps {
  activeMcps: string[];
  onToggleMCP: (mcpId: string) => void;
  onClearAll: () => void;
  onOpenInstallModal?: () => void;
}

export function MCPSelector({
  activeMcps,
  onToggleMCP,
  onClearAll,
  onOpenInstallModal,
}: MCPSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [availableMcps, setAvailableMcps] = useState<MCPForChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Carregar MCPs disponíveis
  useEffect(() => {
    if (isOpen) {
      loadAvailableMCPs();
    }
  }, [isOpen]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  const loadAvailableMCPs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/mcp/available-for-chat");
      const data = await response.json();

      if (data.success) {
        setAvailableMcps(
          data.mcps.map((mcp: any) => ({
            mcpId: mcp.mcpId,
            name: mcp.name,
            toolCount: mcp.toolCount,
            tools: mcp.rawTools || [],
          }))
        );
      }
    } catch (error) {
      console.error("Error loading available MCPs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (mcpId: string) => {
    onToggleMCP(mcpId);
  };

  const filtered = availableMcps.filter((mcp) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      mcp.name.toLowerCase().includes(q) ||
      mcp.tools.some(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q)
      )
    );
  });

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface)] transition-colors"
        title="Manage MCP Tools"
      >
        <Plug className="h-4 w-4" />
        {activeMcps.length > 0 && (
          <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 bg-[var(--accent)] text-[var(--accent-foreground)] text-xs font-medium rounded-full">
            {activeMcps.length}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-96 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg z-50 max-h-[28rem] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-3 border-b border-[var(--border)] sticky top-0 bg-[color-mix(in_oklab,var(--background),black_2%)]/90 backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--background),black_2%)]/70">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4" />
                <span className="font-semibold text-sm">MCP Tools</span>
              </div>
              {activeMcps.length > 0 && (
                <button
                  onClick={onClearAll}
                  className="text-xs px-2 py-1 rounded-md border border-[var(--border)] hover:bg-[var(--surface)]"
                >
                  Limpar tudo
                </button>
              )}
            </div>
            <div className="mt-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por servidor ou ferramenta..."
                className="w-full px-3 py-2 text-sm rounded-md bg-[var(--background)] border border-[var(--border)] outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-4 text-center text-sm text-[var(--foreground)]/60">
                Carregando MCPs...
              </div>
            ) : availableMcps.length === 0 ? (
              <div className="p-4 text-center text-sm text-[var(--foreground)]/60">
                Nenhum MCP instalado
                {onOpenInstallModal && (
                  <div className="mt-2">
                    <button
                      onClick={onOpenInstallModal}
                      className="text-[var(--accent)] hover:underline"
                    >
                      Instalar manualmente
                    </button>
                  </div>
                )}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-[var(--foreground)]/60">
                Nenhum resultado para "{query}"
              </div>
            ) : (
              <div className="p-2">
                {filtered.map((mcp) => {
                  const isActive = activeMcps.includes(mcp.mcpId);

                  return (
                    <div
                      key={mcp.mcpId}
                      className={`p-3 rounded-md mb-2 cursor-pointer transition-colors ${
                        isActive
                          ? "bg-[var(--accent)]/10 border border-[var(--accent)]/30"
                          : "hover:bg-[var(--surface)]"
                      }`}
                      onClick={() => handleToggle(mcp.mcpId)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <input
                              type="checkbox"
                              checked={isActive}
                              onChange={() => {}}
                              className="rounded"
                            />
                            <span className="font-medium text-sm">
                              {mcp.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-[var(--foreground)]/60 ml-6">
                            <Zap className="h-3 w-3" />
                            <span>{mcp.toolCount} ferramentas disponíveis</span>
                          </div>
                          {isActive && mcp.tools.length > 0 && (
                            <div className="mt-2 ml-6">
                              <div className="flex flex-wrap gap-1">
                                {mcp.tools.slice(0, 3).map((tool, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] px-1.5 py-0.5 bg-[var(--accent)]/20 text-[var(--accent)] rounded"
                                    title={tool.description}
                                  >
                                    {tool.name}
                                  </span>
                                ))}
                                {mcp.tools.length > 3 && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-[var(--surface)] rounded">
                                    +{mcp.tools.length - 3}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer info */}
          <div className="p-3 border-t border-[var(--border)] bg-[var(--surface)]/50 flex items-center justify-between">
            <p className="text-xs text-[var(--foreground)]/60">
              {activeMcps.length > 0
                ? `${activeMcps.length} MCPs ativos para enriquecer as respostas`
                : "Nenhum MCP ativo"}
            </p>
            {onOpenInstallModal && (
              <button
                onClick={onOpenInstallModal}
                className="text-xs px-2 py-1 rounded-md border border-[var(--border)] hover:bg-[var(--surface)]"
              >
                Instalar MCP manualmente
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Pills/badges component to show active MCPs in the chat input area
 */
interface ActiveMCPBadgesProps {
  activeMcps: string[];
  mcpNames: Map<string, string>;
  onRemove: (mcpId: string) => void;
}

export function ActiveMCPBadges({
  activeMcps,
  mcpNames,
  onRemove,
}: ActiveMCPBadgesProps) {
  if (activeMcps.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {activeMcps.map((mcpId) => (
        <div
          key={mcpId}
          className="flex items-center gap-1 px-2 py-1 bg-[var(--primary)]/10 text-[var(--primary)] text-xs rounded-md border border-[var(--primary)]/30"
        >
          <Zap className="h-3 w-3" />
          <span className="font-medium">{mcpNames.get(mcpId) || mcpId}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(mcpId);
            }}
            className="ml-1 hover:bg-[var(--primary)]/20 rounded"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
