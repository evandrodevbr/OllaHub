"use client";

import { useState } from "react";
import { X, Package, Star, Download, ExternalLink, CheckCircle } from "lucide-react";
import { MCPProvider } from "@/lib/types/mcp";
import { MCPRatingStars } from "./MCPRatingStars";

interface MCPDetailModalProps {
  mcp: MCPProvider;
  isOpen: boolean;
  onClose: () => void;
  onInstall: () => void;
}

export function MCPDetailModal({ mcp, isOpen, onClose, onInstall }: MCPDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"about" | "capabilities" | "screenshots" | "configuration">("about");

  if (!isOpen) return null;

  const formatDownloads = (downloads: number) => {
    if (downloads >= 1000000) return `${(downloads / 1000000).toFixed(1)}M`;
    if (downloads >= 1000) return `${(downloads / 1000).toFixed(1)}K`;
    return downloads.toString();
  };

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl h-[90vh] bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl mcp-detail-modal">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[var(--primary)]/10 rounded-lg">
              <Package className="h-8 w-8 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{mcp.name}</h2>
              <p className="text-[var(--muted-foreground)]">by {mcp.author}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium mcp-category-badge ${getCategoryColor(mcp.category)}`}>
              {mcp.category}
            </span>
            {mcp.installed && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Installed</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--surface)] rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="p-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <MCPRatingStars rating={mcp.rating} size="md" />
              <span className="text-sm text-[var(--muted-foreground)]">
                ({mcp.totalRatings} reviews)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-[var(--muted-foreground)]" />
              <span className="text-sm">{formatDownloads(mcp.downloads)} downloads</span>
            </div>
            <span className="text-sm text-[var(--muted-foreground)]">Version {mcp.version}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {[
            { id: "about", label: "About" },
            { id: "capabilities", label: "Capabilities" },
            { id: "configuration", label: "Configuration" },
            { id: "screenshots", label: "Screenshots" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-auto">
          {activeTab === "about" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Description</h3>
                <p className="text-[var(--muted-foreground)] leading-relaxed">
                  {mcp.description}
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {mcp.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-[var(--surface)] text-sm rounded-md border border-[var(--border)] mcp-tag"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {(mcp.repository || mcp.homepage) && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Links</h3>
                  <div className="flex gap-4">
                    {mcp.repository && (
                      <a
                        href={mcp.repository}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-[var(--primary)] hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Repository
                      </a>
                    )}
                    {mcp.homepage && (
                      <a
                        href={mcp.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-[var(--primary)] hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Homepage
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "capabilities" && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Capabilities</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(mcp.tools || mcp.capabilities || []).map((capability, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-3 bg-[var(--surface)] rounded-md border border-[var(--border)]"
                  >
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">
                      {typeof capability === 'string' ? capability : (capability as any).name || String(capability)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "configuration" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Installation Configuration</h3>
                {mcp.config && mcp.config.length > 0 ? (
                  <div className="space-y-4">
                    {mcp.config.map((configItem, index) => (
                      <div key={index} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                        <h4 className="font-medium mb-3">Configuration {index + 1}</h4>
                        <div className="space-y-3">
                          {configItem.mcpServers && (
                            <div>
                              <h5 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">Command</h5>
                              <code className="block bg-[var(--background)] p-2 rounded text-sm">
                                {configItem.mcpServers.command} {configItem.mcpServers.arguments?.join(' ')}
                              </code>
                            </div>
                          )}
                          {configItem.mcpServers?.env && Object.keys(configItem.mcpServers.env).length > 0 && (
                            <div>
                              <h5 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">Environment Variables</h5>
                              <div className="space-y-2">
                                {Object.entries(configItem.mcpServers.env).map(([key, value]) => (
                                  <div key={key} className="flex items-center gap-2">
                                    <code className="bg-[var(--background)] px-2 py-1 rounded text-sm font-mono">
                                      {key}={String(value)}
                                    </code>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[var(--muted-foreground)]">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No configuration available for this MCP</p>
                  </div>
                )}
              </div>

              {mcp.tools && mcp.tools.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Available Tools</h3>
                  <div className="space-y-3">
                    {mcp.tools.map((tool, index) => (
                      <div key={index} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
                        <h4 className="font-medium mb-2">{tool.name}</h4>
                        <p className="text-sm text-[var(--muted-foreground)] mb-3">{tool.description}</p>
                        {tool.input_schema && (
                          <div>
                            <h5 className="text-sm font-medium text-[var(--muted-foreground)] mb-2">Parameters</h5>
                            <div className="space-y-2">
                              {Object.entries(tool.input_schema.properties || {}).map(([param, schema]) => (
                                <div key={param} className="flex items-center gap-2">
                                  <code className="bg-[var(--background)] px-2 py-1 rounded text-sm font-mono">
                                    {param}
                                  </code>
                                  <span className="text-xs text-[var(--muted-foreground)]">
                                    {typeof schema === 'object' && schema ? (schema as any).type || 'any' : 'any'}
                                    {tool.input_schema.required?.includes(param) && (
                                      <span className="text-red-500 ml-1">*</span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "screenshots" && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Screenshots</h3>
              {mcp.screenshotUrls && mcp.screenshotUrls.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mcp.screenshotUrls.map((url, index) => (
                    <img
                      key={index}
                      src={url}
                      alt={`Screenshot ${index + 1}`}
                      className="w-full h-48 object-cover rounded-md border border-[var(--border)]"
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-[var(--muted-foreground)]">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No screenshots available</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[var(--border)]">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--background)] transition-colors"
            >
              Close
            </button>
            {!mcp.installed && (
              <button
                onClick={onInstall}
                className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:bg-[var(--primary)]/90 transition-colors mcp-install-button"
              >
                Install MCP
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
