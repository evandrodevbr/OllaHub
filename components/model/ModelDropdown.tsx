"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Cpu, CircuitBoard } from "lucide-react";
import type { ModelInfo } from "@/lib/models";

interface ModelDropdownProps {
  models: ModelInfo[];
  selectedModel: string | null;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelDropdown({
  models,
  selectedModel,
  onSelectModel,
  disabled = false,
}: ModelDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModelData = models.find((m) => m.id === selectedModel);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
              <span className="truncate">{selectedModelData.name}</span>
              <span className="flex items-center gap-1 rounded-md bg-[var(--surface)] px-2 py-0.5 text-xs">
                {selectedModelData.device === "GPU" ? (
                  <CircuitBoard className="h-3 w-3" />
                ) : (
                  <Cpu className="h-3 w-3" />
                )}
                {selectedModelData.device}
              </span>
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
        <div className="absolute top-full z-50 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg">
          <div className="max-h-60 overflow-y-auto">
            {models.length === 0 ? (
              <div className="px-3 py-2 text-sm text-[var(--foreground)]/60">
                No models available
              </div>
            ) : (
              models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onSelectModel(model.id);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface)]"
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-medium">{model.name}</span>
                    <div className="flex items-center gap-2 text-xs text-[var(--foreground)]/60">
                      <span className="rounded-md bg-[var(--surface)] px-2 py-0.5">
                        {model.quantization}
                      </span>
                      <span className="rounded-md bg-[var(--surface)] px-2 py-0.5">
                        {model.sizeGB} GB
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
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
