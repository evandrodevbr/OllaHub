"use client";

import { Search } from "lucide-react";

interface MCPSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
}

export function MCPSearchBar({ value, onChange, onSearch }: MCPSearchBarProps) {
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSearch();
    }
  };

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--muted-foreground)]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Search MCPs..."
        className="w-full pl-10 pr-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent mcp-search-input"
      />
    </div>
  );
}
