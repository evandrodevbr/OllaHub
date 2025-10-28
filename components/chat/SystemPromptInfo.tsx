"use client";

import { Info } from "lucide-react";
import { useState } from "react";

export function SystemPromptInfo() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded hover:bg-[var(--background)]"
        title="About system prompts"
      >
        <Info className="h-3 w-3" />
      </button>

      {isOpen && (
        <div className="absolute top-6 left-0 z-50 w-80 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 shadow-lg">
          <div className="text-xs space-y-2">
            <h4 className="font-medium">System Prompts</h4>
            <p>
              System prompts define the AI's behavior, personality, and response
              style. They are sent once at the beginning of each conversation.
            </p>
            <div className="space-y-1">
              <p className="font-medium">Examples:</p>
              <ul className="list-disc list-inside space-y-1 text-[var(--foreground)]/80">
                <li>"You are a helpful coding assistant"</li>
                <li>"Respond in Portuguese, be concise"</li>
                <li>"You are a creative writing coach"</li>
              </ul>
            </div>
            <p className="text-[var(--foreground)]/60">
              Based on Ollama documentation - system messages help guide model
              behavior.
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-2 right-2 p-1 rounded hover:bg-[var(--surface)]"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
