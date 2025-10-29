"use client";

import { memo } from "react";
import {
  Package,
  Star,
  Eye,
  ExternalLink,
  CheckCircle,
  Zap,
  Settings,
  PlayCircle,
  Loader2,
} from "lucide-react";
import { MCPProvider } from "@/lib/types/mcp";

interface MCPCardProps {
  mcp: MCPProvider;
  onInstall: () => void;
  onUninstall: () => void;
  mode?: "marketplace" | "installed";
  onEditConfig?: () => void;
  onTestServer?: () => void;
  isTesting?: boolean;
  installingStatus?: {
    status: string;
    message: string;
    percentage: number;
  };
}

export const MCPCard = memo(
  function MCPCard({
    mcp,
    onInstall,
    onUninstall,
    mode = "marketplace",
    onEditConfig,
    onTestServer,
    isTesting = false,
    installingStatus,
  }: MCPCardProps) {
    const getCategoryColor = (category: string) => {
      switch (category) {
        case "map":
          return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
        case "browser":
          return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
        case "office":
          return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
        case "search":
          return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
        case "database":
          return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
        case "finance":
          return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
        case "code":
          return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
        case "chart":
          return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200";
        case "payment":
          return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
        default:
          return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
      }
    };

    const formatDownloads = (downloads: number) => {
      if (downloads >= 1000000) return `${(downloads / 1000000).toFixed(1)}M`;
      if (downloads >= 1000) return `${(downloads / 1000).toFixed(1)}K`;
      return downloads.toString();
    };

    const isOfficial = mcp.tags?.includes("official") || false;
    const toolCount = mcp.tools?.length || 0;

    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md transition-all duration-200 hover:border-[var(--primary)]/50 mcp-card">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[var(--primary)]/10 rounded-md">
              <Package className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{mcp.name}</h3>
                {isOfficial && (
                  <CheckCircle className="h-3 w-3 text-green-500" />
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                by {mcp.author}
              </p>
            </div>
          </div>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium mcp-category-badge ${getCategoryColor(
              mcp.category
            )}`}
          >
            {mcp.category}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-[var(--muted-foreground)] mb-3 line-clamp-2">
          {mcp.description}
        </p>

        {/* Stats */}
        <div className="flex items-center gap-4 mb-3 text-xs text-[var(--muted-foreground)]">
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            <span>{mcp.rating}</span>
            <span>({mcp.totalRatings})</span>
          </div>
          {toolCount > 0 && (
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              <span>{toolCount} tools</span>
            </div>
          )}
          <span className="text-xs bg-[var(--surface)] px-2 py-1 rounded">
            v{mcp.version}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-4">
          {mcp.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 bg-[var(--background)] text-xs rounded-md border border-[var(--border)] mcp-tag"
            >
              {tag}
            </span>
          ))}
          {mcp.tags.length > 3 && (
            <span className="px-2 py-1 bg-[var(--background)] text-xs rounded-md border border-[var(--border)] mcp-tag">
              +{mcp.tags.length - 3}
            </span>
          )}
        </div>

        {/* Tools Badges */}
        {mcp.tools && Array.isArray(mcp.tools) && mcp.tools.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-purple-500 dark:text-purple-400" />
                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                  {mcp.tools.length} {mcp.tools.length === 1 ? "Tool" : "Tools"}
                </span>
              </div>
              {mcp.tools.length > 6 && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  Showing 6 of {mcp.tools.length}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-hidden">
              {mcp.tools.slice(0, 6).map((tool: any, index: number) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2.5 py-1 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-950/40 dark:to-purple-900/30 text-purple-700 dark:text-purple-300 text-[11px] font-medium rounded-md border border-purple-200/60 dark:border-purple-800/60 hover:border-purple-300 dark:hover:border-purple-700 transition-colors cursor-default shadow-sm"
                  title={tool.description || tool.name}
                >
                  {tool.name}
                </span>
              ))}
              {mcp.tools.length > 6 && (
                <span className="inline-flex items-center px-2.5 py-1 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/40 dark:to-gray-800/30 text-gray-600 dark:text-gray-400 text-[11px] font-medium rounded-md border border-gray-200/60 dark:border-gray-700/60 shadow-sm">
                  +{mcp.tools.length - 6}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Installation Progress */}
        {installingStatus && (
          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Installing...
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
              <div
                className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${installingStatus.percentage}%` }}
              />
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {installingStatus.message}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {mode === "installed" && onEditConfig ? (
            <>
              <button
                onClick={onEditConfig}
                className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm mcp-install-button"
                title="Editar configuração"
              >
                <Settings className="h-4 w-4" />
              </button>
              {onTestServer && (
                <button
                  onClick={onTestServer}
                  disabled={isTesting}
                  className="px-3 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors text-sm mcp-install-button disabled:opacity-50"
                  title="Testar servidor MCP"
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                onClick={onUninstall}
                className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm mcp-install-button"
                title="Desinstalar MCP"
              >
                Uninstall
              </button>
            </>
          ) : mcp.installed ? (
            <button
              onClick={onUninstall}
              className="w-full px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm mcp-install-button font-medium"
            >
              Uninstall
            </button>
          ) : (
            <button
              onClick={onInstall}
              className="w-full px-3 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90 transition-colors text-sm mcp-install-button font-medium"
            >
              Install
            </button>
          )}
        </div>

        {/* Links */}
        {(mcp.repository || mcp.homepage) && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="flex gap-2">
              {mcp.repository && (
                <a
                  href={mcp.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Repository
                </a>
              )}
              {mcp.homepage && (
                <a
                  href={mcp.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Homepage
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison para evitar re-renders desnecessários
    return (
      prevProps.mcp.id === nextProps.mcp.id &&
      prevProps.mcp.installed === nextProps.mcp.installed &&
      prevProps.mcp.rating === nextProps.mcp.rating &&
      prevProps.mcp.totalRatings === nextProps.mcp.totalRatings &&
      prevProps.mcp.name === nextProps.mcp.name &&
      prevProps.mcp.description === nextProps.mcp.description &&
      prevProps.mode === nextProps.mode &&
      prevProps.isTesting === nextProps.isTesting
    );
  }
);
