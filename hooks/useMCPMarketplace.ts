"use client";

import { useState, useEffect, useCallback } from "react";
import { MCPProvider, MCPSearchParams } from "@/lib/types/mcp";

export function useMCPMarketplace() {
  const [mcps, setMcps] = useState<MCPProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<MCPSearchParams["sort"]>("rating");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedMCP, setSelectedMCP] = useState<MCPProvider | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchMCPs = useCallback(
    async (params?: Partial<MCPSearchParams>) => {
      setLoading(true);
      setError(null);

      try {
        const searchParams = new URLSearchParams();

        const category = params?.category || selectedCategory;
        const search = params?.search || searchTerm;
        const sort = params?.sort || sortBy;
        const order = params?.order || sortOrder;

        if (category && category !== "all") {
          searchParams.append("category", category);
        }
        if (search) {
          searchParams.append("search", search);
        }
        if (sort) {
          searchParams.append("sort", sort);
        }
        if (order) {
          searchParams.append("order", order);
        }
        searchParams.append("limit", "2000"); // Aumentado para 2000

        const response = await fetch(`/api/mcp/list?${searchParams}`);
        const data = await response.json();

        if (data.success) {
          setMcps(data.mcps);
        } else {
          setError(data.error || "Failed to fetch MCPs");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch MCPs");
      } finally {
        setLoading(false);
      }
    },
    [selectedCategory, searchTerm, sortBy, sortOrder]
  );

  const installMCP = useCallback(async (mcpId: string) => {
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
        return { success: true, message: data.installation.message };
      } else {
        return { success: false, message: data.error };
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Failed to install MCP",
      };
    }
  }, []);

  const uninstallMCP = useCallback(async (mcpId: string) => {
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
        return { success: true, message: data.installation.message };
      } else {
        return { success: false, message: data.error };
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Failed to uninstall MCP",
      };
    }
  }, []);

  const viewMCPDetails = useCallback((mcp: MCPProvider) => {
    setSelectedMCP(mcp);
    setShowDetailModal(true);
  }, []);

  const closeDetailModal = useCallback(() => {
    setShowDetailModal(false);
    setSelectedMCP(null);
  }, []);

  const handleSearch = useCallback(
    (search: string) => {
      setSearchTerm(search);
      fetchMCPs({ search });
    },
    [fetchMCPs]
  );

  const handleCategoryChange = useCallback(
    (category: string) => {
      setSelectedCategory(category);
      fetchMCPs({ category });
    },
    [fetchMCPs]
  );

  const handleSortChange = useCallback(
    (sort: MCPSearchParams["sort"]) => {
      setSortBy(sort);
      fetchMCPs({ sort });
    },
    [fetchMCPs]
  );

  const handleOrderChange = useCallback(
    (order: "asc" | "desc") => {
      setSortOrder(order);
      fetchMCPs({ order });
    },
    [fetchMCPs]
  );

  // Carregar MCPs na inicialização
  useEffect(() => {
    fetchMCPs();
  }, []);

  return {
    // Estado
    mcps,
    loading,
    error,
    selectedCategory,
    searchTerm,
    sortBy,
    sortOrder,
    selectedMCP,
    showDetailModal,

    // Ações
    fetchMCPs,
    installMCP,
    uninstallMCP,
    viewMCPDetails,
    closeDetailModal,
    handleSearch,
    handleCategoryChange,
    handleSortChange,
    handleOrderChange,

    // Setters diretos
    setSearchTerm,
    setSortBy,
    setSortOrder,
  };
}
