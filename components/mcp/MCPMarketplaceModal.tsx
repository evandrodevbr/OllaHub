"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Search,
  Filter,
  Package,
  Star,
  Eye,
  CheckCircle,
  XCircle,
  Upload,
} from "lucide-react";
import { MCPProvider, MCPTestResult } from "@/lib/types/mcp";
import { MCPCard } from "./MCPCard";
import { MCPCategoryFilter } from "./MCPCategoryFilter";
import { MCPSearchBar } from "./MCPSearchBar";
import { MCPInstallConfigModal } from "./MCPInstallConfigModal";
import { MCPManualInstallModal } from "./MCPManualInstallModal";
// import { VirtualizedMCPGrid } from "./VirtualizedMCPGrid";

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
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedConfigMCP, setSelectedConfigMCP] =
    useState<MCPProvider | null>(null);
  const [mcpConfig, setMcpConfig] = useState<any>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
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

  // Estados para controle de abas
  const [activeTab, setActiveTab] = useState<"marketplace" | "installed">(
    "marketplace"
  );
  const [installedMcps, setInstalledMcps] = useState<any[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Estados para teste de servidor
  const [testingMCP, setTestingMCP] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<MCPTestResult | null>(null);

  // Estados para tracking de instalação em progresso
  const [installingMcps, setInstallingMcps] = useState<
    Map<
      string,
      {
        status: string;
        message: string;
        percentage: number;
      }
    >
  >(new Map());

  // Estado para modal de instalação manual
  const [manualInstallModalOpen, setManualInstallModalOpen] = useState(false);

  // Função helper para calcular porcentagem baseada no status
  const calculatePercentage = (status: string): number => {
    const statusMap: Record<string, number> = {
      pending: 5,
      checking_dependencies: 10,
      downloading: 30,
      installing: 60,
      testing: 85,
      ready: 100,
      failed: 0,
    };
    return statusMap[status] || 0;
  };

  // Memoizar categorias processadas para evitar re-processamento desnecessário
  const processedCategories = useMemo(
    () => ({
      primary: categories.primary.map((cat) => ({
        id: cat.category.toLowerCase(),
        name: cat.category,
        icon: cat.category,
        count: cat.count,
      })),
      others: categories.others.map((cat) => ({
        id: cat.category.toLowerCase(),
        name: cat.category,
        icon: cat.category,
        count: cat.count,
      })),
    }),
    [categories]
  );

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

  const fetchInstalledMCPs = useCallback(async () => {
    setLoadingInstalled(true);
    try {
      const response = await fetch("/api/mcp/installed");
      const data = await response.json();

      if (data.success) {
        setInstalledMcps(data.mcps);
        console.log("📦 Installed MCPs loaded:", data.mcps.length);

        // Atualizar MCPs do marketplace para marcar como instalados
        setMcps((prevMcps) =>
          prevMcps.map((mcp) => {
            const installedMatch = data.mcps.find(
              (installed: any) =>
                installed.id === mcp.id ||
                installed.repo === mcp.repo ||
                installed.name === mcp.name
            );

            if (installedMatch) {
              return {
                ...mcp,
                installed: true,
                tools: installedMatch.tools || mcp.tools, // Atualizar tools também
              };
            }

            return { ...mcp, installed: false };
          })
        );

        console.log(
          `📊 Marketplace updated: ${data.mcps.length} MCPs marked as installed`
        );
      } else {
        console.error("Failed to fetch installed MCPs:", data.error);
      }
    } catch (error) {
      console.error("Error fetching installed MCPs:", error);
    } finally {
      setLoadingInstalled(false);
    }
  }, []);

  const handleInstall = async (mcpId: string) => {
    try {
      // Limpar ID de possíveis barras no início/fim
      const cleanId = mcpId.replace(/^\/+|\/+$/g, "");

      console.log(
        `[handleInstall] Received mcpId: "${mcpId}" -> cleaned: "${cleanId}"`
      );

      // Buscar dados completos do MCP no cache
      const mcpFromCache = mcps.find((m) => m.id === cleanId || m.id === mcpId);
      if (!mcpFromCache) {
        console.error(
          "MCP not found in cache. Looking for:",
          cleanId,
          "Available IDs:",
          mcps.slice(0, 5).map((m) => m.id)
        );
        return;
      }

      console.log("[handleInstall] Found MCP:", {
        id: mcpFromCache.id,
        owner: mcpFromCache.owner,
        repo: mcpFromCache.repo,
        name: mcpFromCache.name,
      });

      // Construir ID no formato owner/repo
      let finalId = cleanId;
      if (mcpFromCache.owner && mcpFromCache.owner.trim() !== "") {
        finalId = `${mcpFromCache.owner}/${mcpFromCache.repo}`;
      } else if (mcpFromCache.repo) {
        finalId = mcpFromCache.repo;
      }

      console.log(`[handleInstall] Using final ID: "${finalId}"`);

      setLoadingConfig(true);

      // Abrir modal de configuração sempre
      // Se tivermos owner/repo, buscar config; senão, abrir com config vazio
      if (finalId.includes("/")) {
        const configResponse = await fetch(
          `/api/mcp/server-config?mcpId=${encodeURIComponent(finalId)}`
        );
        const configData = await configResponse.json();

        if (configData.success) {
          console.log(
            "Opening config modal with:",
            configData.config ? "provided config" : "empty config"
          );
          setSelectedConfigMCP(mcpFromCache);
          setMcpConfig(configData.config); // Pode ser null
          setConfigModalOpen(true);
        } else {
          console.error("Error fetching server config:", configData.error);
          // Abrir modal mesmo com erro (usuário pode adicionar config)
          setSelectedConfigMCP(mcpFromCache);
          setMcpConfig(null);
          setConfigModalOpen(true);
        }
      } else {
        console.log("No owner/repo format, opening modal with empty config");
        // Abrir modal com config vazio
        setSelectedConfigMCP(mcpFromCache);
        setMcpConfig(null);
        setConfigModalOpen(true);
      }
    } catch (error) {
      console.error("Error preparing MCP installation:", error);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleEditConfig = async (mcp: any) => {
    try {
      setLoadingConfig(true);
      setIsEditMode(true);

      // Converter dados do MCP instalado para formato MCPProvider
      const mcpProvider: MCPProvider = {
        id: mcp.id,
        name: mcp.name,
        author: mcp.author || mcp.owner || "Unknown",
        description: mcp.description || `MCP instalado: ${mcp.name}`,
        version: "1.0.0",
        category: mcp.category || "other",
        tags: mcp.tags || [],
        rating: mcp.rating || 0,
        totalRatings: mcp.totalRatings || 0,
        installed: true,
        repository: mcp.repository || "",
        homepage: mcp.homepage || "",
        config: mcp.config,
        tools: mcp.tools,
      };

      setSelectedConfigMCP(mcpProvider);
      setMcpConfig(mcp.config);
      setConfigModalOpen(true);
    } catch (error) {
      console.error("Error preparing MCP config edit:", error);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleTestServer = async (mcpId: string) => {
    try {
      setTestingMCP(mcpId);
      setTestResult(null);

      console.log(`🧪 Testando servidor MCP: ${mcpId}`);

      const response = await fetch("/api/mcp/test-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpId }),
      });

      const data = await response.json();

      if (data.success) {
        setTestResult(data.result);
        console.log("✅ Teste concluído:", data.result);
      } else {
        setTestResult({
          success: false,
          message: data.error || "Erro desconhecido",
          error: data.error,
        });
        console.error("❌ Erro no teste:", data.error);
      }
    } catch (error: any) {
      console.error("Erro ao testar servidor:", error);
      setTestResult({
        success: false,
        message: "Erro de conexão",
        error: error.message,
      });
    } finally {
      setTestingMCP(null);

      // Limpar resultado após 5 segundos
      setTimeout(() => {
        setTestResult(null);
      }, 5000);
    }
  };

  const handleConfirmInstall = async (editedConfig: any) => {
    if (!selectedConfigMCP) return;

    try {
      if (isEditMode) {
        // Modo de edição - atualizar configuração existente
        const response = await fetch("/api/mcp/update-config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mcpId: selectedConfigMCP.id,
            newConfig: editedConfig,
          }),
        });

        const data = await response.json();
        if (data.success) {
          // Recarregar lista de MCPs instalados
          await fetchInstalledMCPs();
          // Fechar modal
          setConfigModalOpen(false);
          setSelectedConfigMCP(null);
          setMcpConfig(null);
          setIsEditMode(false);
        } else {
          console.error("Error updating MCP config:", data.error);
        }
      } else {
        // Modo de instalação - comportamento original
        let finalId = selectedConfigMCP.id;
        if (!finalId.includes("/")) {
          if (
            selectedConfigMCP.owner &&
            selectedConfigMCP.owner.trim() !== ""
          ) {
            finalId = `${selectedConfigMCP.owner}/${selectedConfigMCP.repo}`;
          } else if (selectedConfigMCP.repo) {
            finalId = selectedConfigMCP.repo;
          }
        }

        const response = await fetch("/api/mcp/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mcpId: finalId,
            customConfig: editedConfig,
          }),
        });

        const data = await response.json();
        if (data.success) {
          console.log(`✅ Installation started for ${finalId}`);

          // Adicionar ao tracking de instalação
          setInstallingMcps((prev) => {
            const next = new Map(prev);
            next.set(finalId, {
              status: data.status || "pending",
              message: "Installation started...",
              percentage: 5,
            });
            return next;
          });

          // Marcar como "instalando" no marketplace (não como instalado ainda)
          // O polling vai atualizar para installed: true quando status === "ready"
          setMcps((prev) =>
            prev.map((mcp) => {
              // Verificar se é o mesmo MCP (por ID ou repo)
              const isSameMcp =
                mcp.id === selectedConfigMCP.id ||
                mcp.id === finalId ||
                mcp.repo === selectedConfigMCP.repo;

              return isSameMcp ? { ...mcp, installed: false } : mcp;
            })
          );

          // Fechar modal
          setConfigModalOpen(false);
          setSelectedConfigMCP(null);
          setMcpConfig(null);
        } else {
          console.error("Error installing MCP:", data.error);
        }
      }
    } catch (error) {
      console.error("Error processing MCP:", error);
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
        console.log(`✅ MCP ${mcpId} uninstalled successfully`);

        // Remover do tracking de instalação (se estiver lá)
        setInstallingMcps((prev) => {
          const next = new Map(prev);
          next.delete(mcpId);
          return next;
        });

        // Atualizar marketplace: marcar como não instalado
        setMcps((prev) =>
          prev.map((mcp) =>
            mcp.id === mcpId || mcp.repo === mcpId
              ? { ...mcp, installed: false }
              : mcp
          )
        );

        // Recarregar lista de instalados para sincronizar
        await fetchInstalledMCPs();

        console.log(`📦 Lists updated after uninstalling ${mcpId}`);
      } else {
        console.error("Failed to uninstall MCP:", data.error);
      }
    } catch (error) {
      console.error("Error uninstalling MCP:", error);
    }
  };

  // Carregar MCPs e categorias quando o modal abrir
  useEffect(() => {
    if (isOpen) {
      fetchMCPs();
      fetchCategories();
    }
  }, [isOpen]); // Removido fetchMCPs das dependências

  // Carregar MCPs instalados quando aba "installed" for ativada
  // Carregar MCPs instalados sempre que o modal abrir (não apenas na aba instalados)
  useEffect(() => {
    if (isOpen) {
      fetchInstalledMCPs();

      // Limpar MCPs órfãos no tracking (que estão instalados mas ainda no Map)
      // Isso previne polling infinito de MCPs que já completaram instalação
      setTimeout(async () => {
        if (installingMcps.size > 0) {
          console.log(
            `🔍 Checking for orphaned installations: ${installingMcps.size} tracked`
          );

          const installedResponse = await fetch("/api/mcp/installed");
          const installedData = await installedResponse.json();

          if (installedData.success) {
            const installedIds = new Set(
              installedData.mcps.map((m: any) => m.id)
            );

            setInstallingMcps((prev) => {
              const next = new Map(prev);
              let removed = 0;

              for (const mcpId of prev.keys()) {
                // Se já está instalado, remover do tracking
                if (installedIds.has(mcpId)) {
                  next.delete(mcpId);
                  removed++;
                  console.log(`🧹 Removed orphaned tracking for ${mcpId}`);
                }
              }

              if (removed > 0) {
                console.log(`✅ Cleaned ${removed} orphaned installations`);
              }

              return next;
            });
          }
        }
      }, 1000); // Aguardar 1 segundo após abrir modal
    }
  }, [isOpen, fetchInstalledMCPs]);

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

  // Poll status de instalações em progresso
  useEffect(() => {
    if (installingMcps.size === 0) return;

    const interval = setInterval(async () => {
      for (const mcpId of installingMcps.keys()) {
        try {
          const response = await fetch(
            `/api/mcp/install-status?mcpId=${mcpId}`
          );
          const data = await response.json();

          if (data.success) {
            const status = data.status;
            const isComplete = status === "ready" || status === "failed";

            if (isComplete) {
              console.log(
                `🎉 Installation ${status} for ${mcpId}, updating lists...`
              );

              // Remover do tracking
              setInstallingMcps((prev) => {
                const next = new Map(prev);
                next.delete(mcpId);
                return next;
              });

              // Se instalação foi bem-sucedida, marcar como instalado imediatamente
              if (status === "ready") {
                const toolsCount = data.validationResult?.tools?.length || 0;
                console.log(
                  `✨ Marking ${mcpId} as installed with ${toolsCount} tools`
                );

                setMcps((prev) =>
                  prev.map((mcp) =>
                    mcp.id === mcpId || mcp.repo === mcpId || mcp.name === mcpId
                      ? {
                          ...mcp,
                          installed: true,
                          tools: data.validationResult?.tools || mcp.tools,
                        }
                      : mcp
                  )
                );
              }

              // Recarregar lista de instalados sempre (não apenas na aba)
              await fetchInstalledMCPs();

              console.log(`✅ Lists synchronized after ${status} for ${mcpId}`);
            } else {
              // Atualizar progresso
              setInstallingMcps((prev) => {
                const next = new Map(prev);
                next.set(mcpId, {
                  status: data.status,
                  message: data.message || "",
                  percentage: calculatePercentage(data.status),
                });
                return next;
              });
            }
          } else {
            // MCP não encontrado ou erro no servidor
            console.warn(`⚠️ MCP ${mcpId} not found or error: ${data.error}`);

            // Remover do tracking após erro (evita polling infinito)
            setInstallingMcps((prev) => {
              const next = new Map(prev);
              next.delete(mcpId);
              return next;
            });
          }
        } catch (error) {
          console.error(`❌ Error polling status for ${mcpId}:`, error);

          // Remover do tracking após erro de rede (evita polling infinito)
          setInstallingMcps((prev) => {
            const next = new Map(prev);
            next.delete(mcpId);
            return next;
          });
        }
      }
    }, 2000); // Poll a cada 2 segundos

    return () => clearInterval(interval);
  }, [installingMcps, activeTab]);

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
              {activeTab === "marketplace"
                ? `${mcps.length} MCPs available`
                : `${installedMcps.length} MCPs installed`}
            </span>
            {loadingConfig && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                <span>Carregando configuração...</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setManualInstallModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              title="Install MCP manually from configuration"
            >
              <Upload className="h-4 w-4" />
              Install Manual
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--surface)] rounded-md transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[var(--border)] px-6 flex-shrink-0">
          <button
            onClick={() => setActiveTab("marketplace")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "marketplace"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            Marketplace
          </button>
          <button
            onClick={() => setActiveTab("installed")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "installed"
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            Instalados ({installedMcps.length})
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
          {/* Sidebar - apenas para marketplace */}
          {activeTab === "marketplace" && (
            <div className="w-64 border-r border-[var(--border)] p-4 flex-shrink-0 overflow-y-auto">
              <MCPCategoryFilter
                primaryCategories={processedCategories.primary}
                otherCategories={processedCategories.others}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
              />
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search and Filters - apenas para marketplace */}
            {activeTab === "marketplace" && (
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
                      <option value="updated_at">
                        Atualizados Recentemente
                      </option>
                    </select>

                    <button
                      onClick={() =>
                        setSortOrder((prev) =>
                          prev === "asc" ? "desc" : "asc"
                        )
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
            )}

            {/* MCP Grid */}
            <div className="flex-1 p-4 overflow-y-auto">
              {activeTab === "marketplace" && (
                <>
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
                          installingStatus={installingMcps.get(mcp.id)}
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
                </>
              )}

              {activeTab === "installed" && (
                <>
                  {loadingInstalled ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {installedMcps.map((mcp) => (
                        <MCPCard
                          key={mcp.id}
                          mcp={{
                            id: mcp.id,
                            name: mcp.name,
                            author: mcp.author || mcp.owner || "Unknown",
                            description:
                              mcp.description || `MCP instalado: ${mcp.name}`,
                            version: "1.0.0",
                            category: mcp.category || "other",
                            tags: mcp.tags || [],
                            rating: mcp.rating || 0,
                            totalRatings: mcp.totalRatings || 0,
                            installed: true,
                            repository: mcp.repository || "",
                            homepage: mcp.homepage || "",
                            config: mcp.config,
                            tools: mcp.tools,
                          }}
                          mode="installed"
                          onInstall={() => {}} // Não usado no modo installed
                          onEditConfig={() => handleEditConfig(mcp)}
                          onTestServer={() => handleTestServer(mcp.id)}
                          isTesting={testingMCP === mcp.id}
                          onUninstall={() => handleUninstall(mcp.id)}
                          installingStatus={installingMcps.get(mcp.id)}
                        />
                      ))}
                    </div>
                  )}

                  {!loadingInstalled && installedMcps.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-[var(--muted-foreground)]">
                      <Package className="h-12 w-12 mb-4 opacity-50" />
                      <p>Nenhum MCP instalado</p>
                      <p className="text-sm">Instale MCPs na aba Marketplace</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Install Modal */}
      <MCPManualInstallModal
        isOpen={manualInstallModalOpen}
        onClose={() => setManualInstallModalOpen(false)}
        onSuccess={async (mcpId) => {
          console.log(`✅ Manual installation started for ${mcpId}`);

          // Adicionar ao tracking de instalação
          setInstallingMcps((prev) => {
            const next = new Map(prev);
            next.set(mcpId, {
              status: "pending",
              message: "Installation started...",
              percentage: 5,
            });
            return next;
          });

          // Atualizar listas
          await fetchMCPs();
          if (activeTab === "installed") {
            await fetchInstalledMCPs();
          }
        }}
      />

      {/* Config Modal */}
      {selectedConfigMCP && (
        <MCPInstallConfigModal
          mcp={selectedConfigMCP}
          config={mcpConfig}
          isOpen={configModalOpen}
          onClose={() => {
            setConfigModalOpen(false);
            setSelectedConfigMCP(null);
            setMcpConfig(null);
            setIsEditMode(false);
          }}
          onConfirm={handleConfirmInstall}
          isEditMode={isEditMode}
        />
      )}

      {/* Toast de resultado do teste */}
      {testResult && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-sm ${
            testResult.success ? "bg-green-500" : "bg-red-500"
          } text-white`}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-sm">{testResult.message}</p>
              {testResult.responseTime && (
                <p className="text-xs opacity-90">
                  Tempo de resposta: {testResult.responseTime}ms
                </p>
              )}
              {testResult.error && (
                <p className="text-xs opacity-90 font-mono">
                  {testResult.error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
