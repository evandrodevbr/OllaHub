"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface MCPCategory {
  id: string;
  name: string;
  icon: string;
  count: number;
}

interface MCPCategoryFilterProps {
  primaryCategories: MCPCategory[];
  otherCategories: MCPCategory[];
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
}

export function MCPCategoryFilter({
  primaryCategories,
  otherCategories,
  selectedCategory,
  onSelectCategory,
}: MCPCategoryFilterProps) {
  const [showOthers, setShowOthers] = useState(false);

  const getCategoryIcon = (categoryName: string) => {
    const iconMap: Record<string, string> = {
      MAP: "🗺️",
      BROWSER: "🌐",
      OFFICE: "📄",
      CODE: "💻",
      DATABASE: "🗄️",
      SEARCH: "🔍",
      PAYMENT: "💳",
      CHART: "📊",
      FINANCE: "💰",
      OTHER: "📦",
    };
    return iconMap[categoryName.toUpperCase()] || "📦";
  };

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm text-[var(--foreground)] mb-3">
        Categories
      </h3>

      {/* All Categories */}
      <button
        onClick={() => onSelectCategory("all")}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
          selectedCategory === "all"
            ? "mcp-category-active"
            : "hover:bg-[var(--surface)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        }`}
      >
        <span className="flex items-center gap-2">📦 All Categories</span>
        <span className="text-xs bg-[var(--background)] px-2 py-1 rounded-full">
          {primaryCategories.reduce((sum, cat) => sum + cat.count, 0) +
            otherCategories.reduce((sum, cat) => sum + cat.count, 0)}
        </span>
      </button>

      {/* Primary Categories */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide">
          Principais
        </h4>
        {primaryCategories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
              selectedCategory === category.id
                ? "mcp-category-active"
                : "hover:bg-[var(--surface)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <span className="flex items-center gap-2">
              {getCategoryIcon(category.name)} {category.name}
            </span>
            <span className="text-xs bg-[var(--background)] px-2 py-1 rounded-full">
              {category.count}
            </span>
          </button>
        ))}
      </div>

      {/* Other Categories */}
      {otherCategories.length > 0 && (
        <div className="space-y-1">
          <button
            onClick={() => setShowOthers(!showOthers)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors hover:bg-[var(--surface)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <span className="flex items-center gap-2">
              {showOthers ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="text-xs font-medium uppercase tracking-wide">
                Outras ({otherCategories.length})
              </span>
            </span>
          </button>

          {showOthers && (
            <div className="ml-4 space-y-1">
              {otherCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => onSelectCategory(category.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedCategory === category.id
                      ? "mcp-category-active"
                      : "hover:bg-[var(--surface)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    📦 {category.name}
                  </span>
                  <span className="text-xs bg-[var(--background)] px-2 py-1 rounded-full">
                    {category.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
