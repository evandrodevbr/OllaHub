"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Search, Filter, Package, Star, Eye } from "lucide-react";
import { MCPProvider } from "@/lib/types/mcp";
import { MCPCard } from "./MCPCard";
import { MCPCategoryFilter } from "./MCPCategoryFilter";
import { MCPSearchBar } from "./MCPSearchBar";

interface MCPMarketplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MCPMarketplaceModal({
  isOpen,
  onClose,
}: MCPMarketplaceModalProps) {
  const [mcps, setMcps] = useState<MCPProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<
    "rating" | "name" | "recent" | "total_ratings" | "updated_at"
  >("rating");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedMCP, setSelectedMCP] = useState<MCPProvider | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    isSyncing: boolean;
    lastSync: number | null;
    totalCached: number;
    cacheValid: boolean;
  } | null>(null);
  const [categories, setCategories] = useState<{
    primary: Array<{ category: string; count: number }>;
    others: Array<{ category: string; count: number }>;
  }>({ primary: [], others: [] });

  const fetchMCPs = useCallback(async () => {
    console.log("Fetching MCPs with params:", {
      selectedCategory,
      debouncedSearchTerm,
      sortBy,
      sortOrder,
    });
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "all")
        params.append("category", selectedCategory);
      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);
      params.append("sort", sortBy);
      params.append("order", sortOrder);
      params.append("limit", "2000"); // Aumentado para 2000

      const response = await fetch(`/api/mcp/list?${params}`);
      const data = await response.json();

      if (data.success) {
        setMcps(data.mcps);
      }
    } catch (error) {
      console.error("Error fetching MCPs:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, debouncedSearchTerm, sortBy, sortOrder]);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/mcp/categories");
      const data = await response.json();

      if (data.success) {
        setCategories(data.categories);
        console.log("📊 Categories loaded:", data.categories);
      } else {
        console.error("Failed to fetch categories:", data.error);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }, []);

  const handleInstall = async (mcpId: string) => {
    try {
      const response = await fetch("/api/mcp/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpId }),
      });

      const data = await response.json();
      if (data.success) {
        // Atualizar estado local
        setMcps((prev) =>
          prev.map((mcp) =>
            mcp.id === mcpId ? { ...mcp, installed: true } : mcp
          )
        );
      }
    } catch (error) {
      console.error("Error installing MCP:", error);
    }
  };

  const handleUninstall = async (mcpId: string) => {
    try {
      const response = await fetch("/api/mcp/uninstall", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpId }),
      });

      const data = await response.json();
      if (data.success) {
        // Atualizar estado local
        setMcps((prev) =>
          prev.map((mcp) =>
            mcp.id === mcpId ? { ...mcp, installed: false } : mcp
          )
        );
      }
    } catch (error) {
      console.error("Error uninstalling MCP:", error);
    }
  };

  const handleViewDetails = (mcp: MCPProvider) => {
    setSelectedMCP(mcp);
  };

  // Carregar MCPs e categorias quando o modal abrir
  useEffect(() => {
    if (isOpen) {
      fetchMCPs();
      fetchCategories();
    }
  }, [isOpen]); // Removido fetchMCPs das dependências

  // Debounce para searchTerm
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch sync status when modal opens
  useEffect(() => {
    if (isOpen) {
      fetch("/api/mcp/sync")
        .then((r) => r.json())
        .then((data) => {
          setSyncStatus({
            isSyncing: data.isSyncing,
            lastSync: data.lastSync,
            totalCached: data.totalCached,
            cacheValid: data.cacheValid,
          });
        })
        .catch(console.error);
    }
  }, [isOpen]);

  // Recarregar MCPs quando filtros mudarem (só se modal estiver aberto)
  useEffect(() => {
    if (isOpen) {
      fetchMCPs();
    }
  }, [selectedCategory, debouncedSearchTerm, sortBy, sortOrder, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-7xl h-[95vh] bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-[var(--primary)]" />
            <h2 className="text-xl font-semibold">MCP Marketplace</h2>
            <span className="text-sm text-[var(--muted-foreground)]">
              {mcps.length} MCPs available
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--surface)] rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sync Status Banner */}
        {syncStatus?.isSyncing && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm text-blue-700 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              <span>
                Sincronizando marketplace... {syncStatus.totalCached} servidores
                carregados
              </span>
            </div>
          </div>
        )}

        {syncStatus?.lastSync && !syncStatus.isSyncing && (
          <div className="bg-green-50 border-b border-green-200 px-4 py-2 text-sm text-green-700 flex-shrink-0">
            <div className="flex items-center justify-between">
              <span>
                Cache local ativo • {syncStatus.totalCached} servidores • Última
                atualização: {new Date(syncStatus.lastSync).toLocaleString()}
              </span>
              <button
                onClick={() => {
                  fetch("/api/mcp/sync", { method: "POST" })
                    .then(() => {
                      // Recarregar status após iniciar sync
                      fetch("/api/mcp/sync")
                        .then((r) => r.json())
                        .then((data) =>
                          setSyncStatus({
                            isSyncing: data.isSyncing,
                            lastSync: data.lastSync,
                            totalCached: data.totalCached,
                            cacheValid: data.cacheValid,
                          })
                        );
                    })
                    .catch(console.error);
                }}
                className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
              >
                Atualizar
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-64 border-r border-[var(--border)] p-4 flex-shrink-0 overflow-y-auto">
            <MCPCategoryFilter
              primaryCategories={categories.primary.map((cat) => ({
                id: cat.category.toLowerCase(),
                name: cat.category,
                icon: cat.category,
                count: cat.count,
              }))}
              otherCategories={categories.others.map((cat) => ({
                id: cat.category.toLowerCase(),
                name: cat.category,
                icon: cat.category,
                count: cat.count,
              }))}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search and Filters */}
            <div className="p-4 border-b border-[var(--border)] flex-shrink-0">
              <div className="flex gap-4 items-center">
                <MCPSearchBar
                  value={searchTerm}
                  onChange={setSearchTerm}
                  onSearch={() => {
                    // O useEffect já cuida de recarregar quando searchTerm muda
                  }}
                />
                <div className="flex gap-2 items-center">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm"
                  >
                    <option value="rating">Por Avaliação</option>
                    <option value="name">Por Nome</option>
                    <option value="recent">Mais Recentes</option>
                    <option value="total_ratings">Por Nº de Reviews</option>
                    <option value="updated_at">Atualizados Recentemente</option>
                  </select>

                  <button
                    onClick={() =>
                      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
                    }
                    className="px-3 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--surface)] transition-colors"
                    title={
                      sortOrder === "asc"
                        ? "Ordem Crescente"
                        : "Ordem Decrescente"
                    }
                  >
                    {sortOrder === "asc" ? "↑" : "↓"}
                  </button>
                </div>
              </div>
            </div>

            {/* MCP Grid */}
            <div className="flex-1 p-4 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {mcps.map((mcp) => (
                    <MCPCard
                      key={mcp.id}
                      mcp={mcp}
                      onInstall={() => handleInstall(mcp.id)}
                      onUninstall={() => handleUninstall(mcp.id)}
                      onViewDetails={() => handleViewDetails(mcp)}
                    />
                  ))}
                </div>
              )}

              {!loading && mcps.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-[var(--muted-foreground)]">
                  <Package className="h-12 w-12 mb-4 opacity-50" />
                  <p>No MCPs found</p>
                  <p className="text-sm">
                    Try adjusting your search or filters
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
