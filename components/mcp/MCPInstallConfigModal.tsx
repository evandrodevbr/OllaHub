"use client";

import { useState, useEffect } from "react";
import {
  X,
  Package,
  AlertCircle,
  CheckCircle,
  Info,
  ExternalLink,
} from "lucide-react";
import { MCPProvider } from "@/lib/types/mcp";

interface MCPInstallConfigModalProps {
  mcp: MCPProvider;
  config: any; // Configuração inicial do servidor
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (editedConfig: any) => void;
  isEditMode?: boolean; // Novo prop para indicar modo de edição
}

export function MCPInstallConfigModal({
  mcp,
  config,
  isOpen,
  onClose,
  onConfirm,
  isEditMode = false,
}: MCPInstallConfigModalProps) {
  const [jsonString, setJsonString] = useState("");
  const [isValidJson, setIsValidJson] = useState(true);
  const [jsonError, setJsonError] = useState("");
  const [hasEnvVars, setHasEnvVars] = useState(false);

  // Inicializar JSON quando config mudar
  useEffect(() => {
    if (config) {
      try {
        const formattedJson = JSON.stringify(config, null, 2);
        setJsonString(formattedJson);
        setIsValidJson(true);
        setJsonError("");

        // Verificar se tem variáveis de ambiente
        const hasEnv =
          JSON.stringify(config).includes('"env"') ||
          JSON.stringify(config).includes("env:");
        setHasEnvVars(hasEnv);
      } catch (error) {
        console.error("Error formatting config:", error);
        setJsonString("{}");
        setIsValidJson(false);
        setJsonError("Erro ao formatar configuração");
      }
    } else {
      // Config vazio - criar template baseado no MCP
      // Usar npm ou nome do repositório se disponível
      const serverName = mcp.id || mcp.name.toLowerCase().replace(/\s+/g, "-");
      const command = mcp.repository?.includes("npm")
        ? "npx"
        : mcp.repository
        ? "node"
        : "npm";

      const template = {
        mcpServers: {
          [serverName]: {
            command: command,
            args: command === "npx" ? ["-y", serverName] : [],
            env: {},
          },
        },
      };

      setJsonString(JSON.stringify(template, null, 2));
      setIsValidJson(true);
      setJsonError("");
      setHasEnvVars(false);
    }
  }, [config]);

  // Validar JSON em tempo real
  const validateJson = (value: string) => {
    try {
      JSON.parse(value);
      setIsValidJson(true);
      setJsonError("");
      return true;
    } catch (error) {
      setIsValidJson(false);
      setJsonError(error instanceof Error ? error.message : "JSON inválido");
      return false;
    }
  };

  const handleJsonChange = (value: string) => {
    setJsonString(value);
    validateJson(value);
  };

  const handleConfirm = () => {
    if (!isValidJson) {
      return;
    }

    try {
      const parsedConfig = JSON.parse(jsonString);
      onConfirm(parsedConfig);
    } catch (error) {
      console.error("Error parsing config:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-4xl h-[90vh] bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[var(--primary)]/10 rounded-lg">
              <Package className="h-8 w-8 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                {isEditMode ? "Editar Configuração" : "Configurar Instalação"}
              </h2>
              <div className="flex items-center gap-2">
                <p className="text-[var(--muted-foreground)]">
                  {mcp.name} por {mcp.author}
                </p>
                {(mcp.repository || mcp.homepage) && (
                  <a
                    href={mcp.repository || mcp.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors"
                    title="Ver no GitHub"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span className="text-sm">GitHub</span>
                  </a>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--surface)] rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Instructions */}
        <div className="p-6 border-b border-[var(--border)] bg-blue-50 dark:bg-blue-900/20">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                Instruções de Configuração
              </p>
              <ul className="text-blue-700 dark:text-blue-300 space-y-1">
                <li>
                  • <strong>Edite apenas os campos necessários</strong>,
                  especialmente variáveis de ambiente (env)
                </li>
                <li>
                  • Adicione suas <strong>API keys</strong>,{" "}
                  <strong>tokens</strong> e <strong>credenciais</strong> nos
                  campos env
                </li>
                <li>
                  • Mantenha a estrutura JSON válida - use aspas duplas e
                  vírgulas corretamente
                </li>
                <li>
                  • Campos como "command" geralmente não precisam ser alterados
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* JSON Editor */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Configuração do Servidor</h3>
            <div className="flex items-center gap-2">
              {isValidJson ? (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">JSON válido</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">JSON inválido</span>
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {!isValidJson && jsonError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-700 dark:text-red-300">
                  <p className="font-medium">Erro no JSON:</p>
                  <p className="font-mono text-xs mt-1">{jsonError}</p>
                </div>
              </div>
            </div>
          )}

          {/* JSON Textarea - Área maior */}
          <div className="flex-1 min-h-0 mb-4">
            <textarea
              value={jsonString}
              onChange={(e) => handleJsonChange(e.target.value)}
              className="w-full h-full p-4 bg-[var(--surface)] border border-[var(--border)] rounded-md font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              placeholder="Digite a configuração JSON aqui..."
              spellCheck={false}
            />
          </div>

          {/* Env Variables Warning */}
          {hasEnvVars && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-yellow-700 dark:text-yellow-300">
                  <p className="font-medium">
                    Variáveis de Ambiente Detectadas
                  </p>
                  <p>
                    Certifique-se de preencher os valores necessários nos campos
                    "env" antes de instalar.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[var(--border)] flex-shrink-0">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--background)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isValidJson}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEditMode ? "Salvar Alterações" : "Confirmar Instalação"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
