"use client";

import { useState } from "react";
import { X, Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface MCPManualInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (mcpId: string) => void;
}

export function MCPManualInstallModal({
  isOpen,
  onClose,
  onSuccess,
}: MCPManualInstallModalProps) {
  const [configJson, setConfigJson] = useState("");
  const [mcpId, setMcpId] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [parsedConfig, setParsedConfig] = useState<any>(null);

  // Validar JSON enquanto digita
  const handleConfigChange = (value: string) => {
    setConfigJson(value);
    setValidationError(null);
    setParsedConfig(null);

    if (!value.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(value);
      setParsedConfig(parsed);

      // Validar estrutura básica
      if (parsed.mcpServers) {
        const serverNames = Object.keys(parsed.mcpServers);
        if (serverNames.length === 0) {
          setValidationError("No MCP server found in configuration");
          return;
        }

        const firstServer = parsed.mcpServers[serverNames[0]];
        if (!firstServer.command) {
          setValidationError("Missing required field: command");
          return;
        }

        // Auto-preencher ID se estiver vazio
        if (!mcpId) {
          setMcpId(serverNames[0]);
        }
      } else {
        // Formato direto
        if (!parsed.command) {
          setValidationError("Missing required field: command");
          return;
        }
      }
    } catch (err: any) {
      setValidationError(`Invalid JSON: ${err.message}`);
    }
  };

  const handleInstall = async () => {
    if (!configJson.trim()) {
      setError("Configuration is required");
      return;
    }

    if (validationError) {
      setError("Please fix validation errors before installing");
      return;
    }

    setIsInstalling(true);
    setError(null);

    try {
      const response = await fetch("/api/mcp/install-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: parsedConfig,
          mcpId: mcpId || undefined,
          enableLogs: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        console.log(`✅ Manual installation started for ${data.mcpId}`);
        onSuccess?.(data.mcpId);
        onClose();

        // Reset form
        setConfigJson("");
        setMcpId("");
        setParsedConfig(null);
      } else {
        setError(data.error || "Failed to start installation");
      }
    } catch (err: any) {
      console.error("Error installing MCP:", err);
      setError(err.message || "Failed to start installation");
    } finally {
      setIsInstalling(false);
    }
  };

  const handlePasteExample = () => {
    const example = `{
  "mcpServers": {
    "time-server": {
      "command": "npx",
      "args": ["@mcpcentral/mcp-time"]
    }
  }
}`;
    setConfigJson(example);
    handleConfigChange(example);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--background)] rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-[var(--border)]">
        {/* Header */}
        <div className="sticky top-0 border-b border-[var(--border)] p-4 flex items-center justify-between bg-[color-mix(in_oklab,var(--background),black_2%)]/90 backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--background),black_2%)]/70">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-xl font-semibold">
              Instalar MCP Manualmente
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--surface)] rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Description */}
          <div className="rounded-lg p-4 border border-[var(--border)] bg-[var(--surface)]/60">
            <h3 className="font-medium mb-2">
              Como usar
            </h3>
            <p className="text-sm mb-3 text-[var(--foreground)]/80">
              Cole a configuração do servidor MCP no formato do Claude Desktop (claude_desktop_config.json).
              Apenas instalação manual é suportada neste projeto.
            </p>
            <button
              onClick={handlePasteExample}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Clique aqui para carregar um exemplo
            </button>
          </div>

          {/* MCP ID (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              MCP ID (opcional)
            </label>
            <input
              type="text"
              value={mcpId}
              onChange={(e) => setMcpId(e.target.value)}
              placeholder="my-custom-mcp (detectado automaticamente se vazio)"
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
            />
          </div>

          {/* Configuration JSON */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              JSON de Configuração *
            </label>
            <textarea
              value={configJson}
              onChange={(e) => handleConfigChange(e.target.value)}
              placeholder={`Cole a configuração aqui, ex.:
{
  "mcpServers": {
    "time-server": {
      "command": "npx",
      "args": ["@mcpcentral/mcp-time"]
    }
  }
}`}
              rows={15}
              className="w-full px-4 py-3 border border-[var(--border)] rounded-lg bg-[var(--background)] font-mono text-sm focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-none"
            />

            {/* Validation Status */}
            {configJson.trim() && (
              <div className="mt-2 flex items-center gap-2">
                {validationError ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-600">{validationError}</span>
                  </>
                ) : parsedConfig ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-600">Configuração válida</span>
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* Preview */}
          {parsedConfig && !validationError && (
            <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface)]/50">
              <h3 className="font-medium mb-3">Pré-visualização</h3>
              <div className="space-y-2 text-sm">
                {parsedConfig.mcpServers ? (
                  Object.entries(parsedConfig.mcpServers).map(
                    ([name, config]: [string, any]) => (
                      <div key={name} className="space-y-1">
                        <div className="">
                          <span className="font-medium">Server:</span> {name}
                        </div>
                        <div className="text-[var(--foreground)]/80">
                          <span className="font-medium">Command:</span>{" "}
                          {config.command} {(config.args || []).join(" ")}
                        </div>
                        {config.env && (
                          <div className="text-[var(--foreground)]/80">
                            <span className="font-medium">Environment:</span>{" "}
                            {Object.keys(config.env).length} variables
                          </div>
                        )}
                      </div>
                    )
                  )
                ) : (
                  <div className="space-y-1">
                    <div className="text-[var(--foreground)]/80">
                      <span className="font-medium">Command:</span>{" "}
                      {parsedConfig.command}{" "}
                      {(parsedConfig.args || []).join(" ")}
                    </div>
                    {parsedConfig.env && (
                      <div className="text-[var(--foreground)]/80">
                        <span className="font-medium">Environment:</span>{" "}
                        {Object.keys(parsedConfig.env).length} variables
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-red-900">Erro na instalação</h4>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--surface)]/60 border-t border-[var(--border)] p-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isInstalling}
            className="px-4 py-2 hover:bg-[var(--surface)] rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleInstall}
            disabled={isInstalling || !parsedConfig || !!validationError}
            className="px-6 py-2 bg-[var(--accent)] text-[var(--accent-foreground)] rounded-lg hover:bg-[color-mix(in_oklab,var(--accent),black_10%)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isInstalling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Instalando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Instalar MCP
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
