"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  Cpu,
  CircuitBoard,
  Search,
  Filter,
  Zap,
  HardDrive,
  Clock,
  TrendingUp,
  X,
  Download,
  Trash2,
  Cloud,
  CheckCircle,
} from "lucide-react";
import type { ModelInfo } from "@/lib/models";

interface ModelDropdownProps {
  models: ModelInfo[];
  selectedModel: string | null;
  onSelectModel: (modelId: string) => void;
  onDeleteModel?: (modelId: string) => void;
  onPullModel?: (modelName: string) => void;
  disabled?: boolean;
}

export function ModelDropdown({
  models,
  selectedModel,
  onSelectModel,
  onDeleteModel,
  onPullModel,
  disabled = false,
}: ModelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDevice, setFilterDevice] = useState<"all" | "CPU" | "GPU">(
    "all"
  );
  const [showRemote, setShowRemote] = useState(false);
  const [remoteModels, setRemoteModels] = useState<any[]>([]);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Buscar modelos remotos
  const searchRemoteModels = async (query: string) => {
    setIsSearchingRemote(true);
    try {
      const response = await fetch(
        `/api/ollama/search?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      if (data.success) {
        setRemoteModels(data.models);
      }
    } catch (error) {
      console.error("Erro ao buscar modelos remotos:", error);
    } finally {
      setIsSearchingRemote(false);
    }
  };

  // Deletar modelo
  const handleDeleteModel = async (modelId: string) => {
    try {
      const response = await fetch("/api/ollama/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName: modelId }),
      });

      if (response.ok) {
        onDeleteModel?.(modelId);
        setShowDeleteConfirm(null);
      }
    } catch (error) {
      console.error("Erro ao deletar modelo:", error);
    }
  };

  // Baixar modelo remoto
  const handlePullModel = (modelName: string) => {
    onPullModel?.(modelName);
  };

  // Filtrar modelos
  const filteredModels = models.filter((model) => {
    const matchesSearch = model.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesDevice =
      filterDevice === "all" || model.device === filterDevice;
    return matchesSearch && matchesDevice;
  });

  // Categorizar modelos por performance
  const categorizeModel = (model: ModelInfo) => {
    if (model.sizeGB <= 3) return "compact";
    if (model.sizeGB <= 7) return "balanced";
    return "powerful";
  };

  const getPerformanceColor = (model: ModelInfo) => {
    const category = categorizeModel(model);
    switch (category) {
      case "compact":
        return "text-green-600 bg-green-50 border-green-200";
      case "balanced":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "powerful":
        return "text-purple-600 bg-purple-50 border-purple-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getPerformanceIcon = (model: ModelInfo) => {
    const category = categorizeModel(model);
    switch (category) {
      case "compact":
        return <Zap className="h-3 w-3" />;
      case "balanced":
        return <TrendingUp className="h-3 w-3" />;
      case "powerful":
        return <CircuitBoard className="h-3 w-3" />;
      default:
        return <Cpu className="h-3 w-3" />;
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm("");
        setFilterDevice("all");
        setShowRemote(false);
        setRemoteModels([]);
        setShowDeleteConfirm(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Buscar modelos remotos quando necessário
  useEffect(() => {
    if (showRemote && searchTerm.length > 2) {
      const timeoutId = setTimeout(() => {
        searchRemoteModels(searchTerm);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [showRemote, searchTerm]);

  const selectedModelData = models.find((m) => m.id === selectedModel);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface)] disabled:opacity-50"
      >
        <div className="flex items-center gap-2">
          {selectedModelData ? (
            <>
              <span className="truncate font-medium">
                {selectedModelData.name}
              </span>
              <div className="flex items-center gap-1">
                <span
                  className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs border ${getPerformanceColor(
                    selectedModelData
                  )}`}
                >
                  {getPerformanceIcon(selectedModelData)}
                  {categorizeModel(selectedModelData)}
                </span>
                <span className="flex items-center gap-1 rounded-md bg-[var(--surface)] px-2 py-0.5 text-xs">
                  {selectedModelData.device === "GPU" ? (
                    <CircuitBoard className="h-3 w-3" />
                  ) : (
                    <Cpu className="h-3 w-3" />
                  )}
                  {selectedModelData.device}
                </span>
              </div>
            </>
          ) : (
            <span className="text-[var(--foreground)]/60">
              Select a model...
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full z-50 mt-1 w-full min-w-[400px] rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-xl">
          {/* Header com busca e filtros */}
          <div className="border-b border-[var(--border)] p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground)]/40" />
                <input
                  type="text"
                  placeholder="Search models..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--foreground)]/40 hover:text-[var(--foreground)]/60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Filter className="h-4 w-4 text-[var(--foreground)]/40" />
                <select
                  value={filterDevice}
                  onChange={(e) =>
                    setFilterDevice(e.target.value as "all" | "CPU" | "GPU")
                  }
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="all">All Devices</option>
                  <option value="CPU">CPU Only</option>
                  <option value="GPU">GPU Only</option>
                </select>
                {/* Instalar por referência */}
                {onPullModel && (
                  <button
                    onClick={() => handlePullModel("")}
                    className="rounded-md bg-[var(--accent)] text-white px-2 py-1 text-xs hover:bg-[color-mix(in_oklab,var(--accent),black_10%)]"
                    title="Instalar por referência (ex.: owner/model:tag)"
                  >
                    Install by ref
                  </button>
                )}
              </div>
            </div>

            {/* Toggle para busca remota */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRemote(!showRemote)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                    showRemote
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface)] text-[var(--foreground)]/60 hover:bg-[var(--surface)]/80"
                  }`}
                >
                  <Cloud className="h-3 w-3" />
                  Remote Search
                </button>
                <div className="text-xs text-[var(--foreground)]/60">
                  {showRemote
                    ? `${remoteModels.length} remote`
                    : `${filteredModels.length} local`}{" "}
                  model
                  {(showRemote
                    ? remoteModels.length
                    : filteredModels.length) !== 1
                    ? "s"
                    : ""}{" "}
                  found
                </div>
              </div>
            </div>
          </div>

          {/* Lista de modelos com scroll customizado */}
          <div className="max-h-80 overflow-y-auto custom-scrollbar">
            {showRemote ? (
              // Lista de modelos remotos
              <>
                {isSearchingRemote ? (
                  <div className="px-4 py-8 text-center text-sm text-[var(--foreground)]/60">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--accent)] mx-auto mb-2"></div>
                    Searching remote models...
                  </div>
                ) : remoteModels.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[var(--foreground)]/60">
                    <Cloud className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No remote models found
                  </div>
                ) : (
                  <div className="p-2">
                    {remoteModels.map((model) => (
                      <div
                        key={model.name}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 mb-2"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">
                                {model.name}
                              </span>
                              <span className="flex items-center gap-1 rounded-md bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 text-xs">
                                <Cloud className="h-3 w-3" />
                                Remote
                              </span>
                              {model.installed && (
                                <span className="flex items-center gap-1 rounded-md bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 text-xs">
                                  <CheckCircle className="h-3 w-3" />
                                  Installed
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="text-xs text-[var(--foreground)]/50">
                            Available for download
                          </div>
                          <button
                            onClick={() => handlePullModel(model.name)}
                            disabled={model.installed}
                            className="flex items-center gap-1 rounded-md bg-[var(--accent)] text-white px-3 py-1 text-xs hover:bg-[color-mix(in_oklab,var(--accent),black_10%)] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Download className="h-3 w-3" />
                            {model.installed ? "Installed" : "Download"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              // Lista de modelos locais
              <>
                {filteredModels.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[var(--foreground)]/60">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No models found
                  </div>
                ) : (
                  <div className="p-2">
                    {filteredModels.map((model) => (
                      <div
                        key={model.id}
                        className={`w-full rounded-lg border p-3 mb-2 transition-all hover:shadow-md ${
                          selectedModel === model.id
                            ? "border-[var(--accent)] bg-[var(--accent)]/5"
                            : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--surface)]"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">
                                {model.name}
                              </span>
                              <span
                                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs border ${getPerformanceColor(
                                  model
                                )}`}
                              >
                                {getPerformanceIcon(model)}
                                {categorizeModel(model)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[var(--foreground)]/60">
                              <span className="flex items-center gap-1">
                                <HardDrive className="h-3 w-3" />
                                {model.sizeGB} GB
                              </span>
                              <span className="rounded-md bg-[var(--surface)] px-2 py-0.5">
                                {model.quantization}
                              </span>
                              <span className="flex items-center gap-1">
                                {model.device === "GPU" ? (
                                  <CircuitBoard className="h-3 w-3" />
                                ) : (
                                  <Cpu className="h-3 w-3" />
                                )}
                                {model.device}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Informações técnicas e ações */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-xs text-[var(--foreground)]/50">
                            {model.estCpuUsagePct && (
                              <div className="flex items-center gap-1">
                                <Cpu className="h-3 w-3" />
                                <span>{model.estCpuUsagePct}% CPU</span>
                              </div>
                            )}
                            {model.estVramGB && model.estVramGB > 0 && (
                              <div className="flex items-center gap-1">
                                <CircuitBoard className="h-3 w-3" />
                                <span>{model.estVramGB} GB VRAM</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onSelectModel(model.id)}
                              className="rounded-md bg-[var(--accent)] text-white px-3 py-1 text-xs hover:bg-[color-mix(in_oklab,var(--accent),black_10%)]"
                            >
                              Select
                            </button>
                            {onDeleteModel && (
                              <button
                                onClick={() => setShowDeleteConfirm(model.id)}
                                className="rounded-md bg-red-50 text-red-600 border border-red-200 px-3 py-1 text-xs hover:bg-red-100"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Confirmação de exclusão */}
                        {showDeleteConfirm === model.id && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                            <div className="text-xs text-red-700 mb-2">
                              Are you sure you want to delete this model?
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleDeleteModel(model.id)}
                                className="rounded-md bg-red-600 text-white px-2 py-1 text-xs hover:bg-red-700"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="rounded-md bg-gray-200 text-gray-700 px-2 py-1 text-xs hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
