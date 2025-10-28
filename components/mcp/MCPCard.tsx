"use client";

import { Package, Star, Download, Eye, ExternalLink, CheckCircle, Zap } from "lucide-react";
import { MCPProvider } from "@/lib/types/mcp";

interface MCPCardProps {
  mcp: MCPProvider;
  onInstall: () => void;
  onUninstall: () => void;
  onViewDetails: () => void;
}

export function MCPCard({ mcp, onInstall, onUninstall, onViewDetails }: MCPCardProps) {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "map": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "browser": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "office": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "search": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "database": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200";
      case "finance": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
      case "code": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "chart": return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200";
      case "payment": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const formatDownloads = (downloads: number) => {
    if (downloads >= 1000000) return `${(downloads / 1000000).toFixed(1)}M`;
    if (downloads >= 1000) return `${(downloads / 1000).toFixed(1)}K`;
    return downloads.toString();
  };

  const isOfficial = mcp.tags?.includes('official') || false;
  const toolCount = mcp.tools?.length || mcp.capabilities?.length || 0;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md transition-all duration-200 hover:border-[var(--primary)]/50 mcp-card">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {mcp.iconUrl ? (
            <img 
              src={mcp.iconUrl} 
              alt={mcp.name}
              className="h-8 w-8 rounded-md object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`p-2 bg-[var(--primary)]/10 rounded-md ${mcp.iconUrl ? 'hidden' : ''}`}>
            <Package className="h-4 w-4 text-[var(--primary)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">{mcp.name}</h3>
              {isOfficial && (
                <CheckCircle className="h-3 w-3 text-green-500" />
              )}
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">by {mcp.author}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium mcp-category-badge ${getCategoryColor(mcp.category)}`}>
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
        <div className="flex items-center gap-1">
          <Download className="h-3 w-3" />
          <span>{formatDownloads(mcp.downloads)}</span>
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

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onViewDetails}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md hover:bg-[var(--surface)] transition-colors text-sm"
        >
          <Eye className="h-4 w-4" />
          Details
        </button>
        
        {mcp.installed ? (
          <button
            onClick={onUninstall}
            className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm mcp-install-button"
          >
            Uninstall
          </button>
        ) : (
          <button
            onClick={onInstall}
            className="px-3 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90 transition-colors text-sm mcp-install-button"
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
}
