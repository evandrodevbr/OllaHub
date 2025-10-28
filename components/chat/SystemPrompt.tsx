"use client";

import { useState, useEffect } from "react";
import { Settings, Save, RotateCcw } from "lucide-react";
import { SystemPromptInfo } from "./SystemPromptInfo";

interface SystemPromptProps {
  onSystemPromptChange: (prompt: string) => void;
}

export function SystemPrompt({ onSystemPromptChange }: SystemPromptProps) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("ollahub-system-prompt");
    if (saved) {
      setSystemPrompt(saved);
      onSystemPromptChange(saved);
    }
  }, [onSystemPromptChange]);

  const handleSave = () => {
    localStorage.setItem("ollahub-system-prompt", systemPrompt);
    onSystemPromptChange(systemPrompt);
    setIsEditing(false);
    setHasChanges(false);
  };

  const handleReset = () => {
    const defaultPrompt = "";
    setSystemPrompt(defaultPrompt);
    localStorage.removeItem("ollahub-system-prompt");
    onSystemPromptChange(defaultPrompt);
    setIsEditing(false);
    setHasChanges(false);
  };

  const handleChange = (value: string) => {
    setSystemPrompt(value);
    setHasChanges(true);
    setIsEditing(true);
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-[var(--foreground)]/80">
          System Prompt
        </h3>
        <div className="flex gap-1">
          <SystemPromptInfo />
          {isEditing && (
            <>
              <button
                onClick={handleSave}
                disabled={!hasChanges}
                className="p-1 rounded hover:bg-[var(--background)] disabled:opacity-50"
                title="Save prompt"
              >
                <Save className="h-3 w-3" />
              </button>
              <button
                onClick={handleReset}
                className="p-1 rounded hover:bg-[var(--background)]"
                title="Reset to default"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </>
          )}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-1 rounded hover:bg-[var(--background)]"
            title="Edit system prompt"
          >
            <Settings className="h-3 w-3" />
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={systemPrompt}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Enter system prompt (optional)..."
            className="w-full h-24 resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <p className="text-xs text-[var(--foreground)]/60">
            System prompts help define the AI's behavior and personality.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
          {systemPrompt ? (
            <p className="text-xs text-[var(--foreground)]/80 whitespace-pre-wrap">
              {systemPrompt}
            </p>
          ) : (
            <p className="text-xs text-[var(--foreground)]/60 italic">
              No system prompt set
            </p>
          )}
        </div>
      )}
    </div>
  );
}
