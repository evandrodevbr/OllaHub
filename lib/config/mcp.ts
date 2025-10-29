/**
 * Configurações para instalação e gerenciamento de servidores MCP
 */

import path from "path";

export const MCP_CONFIG = {
  // Diretório base onde os servidores MCP serão instalados
  serversDir:
    process.env.MCP_SERVERS_DIR || path.join(process.cwd(), "mcp-servers"),

  // Timeout para instalação de pacotes (5 minutos)
  installTimeout: parseInt(process.env.MCP_INSTALL_TIMEOUT || "300000", 10),

  // Timeout para testes de servidor (10 segundos)
  testTimeout: parseInt(process.env.MCP_TEST_TIMEOUT || "10000", 10),

  // Habilitar logs detalhados (para debug/testes)
  enableLogs: process.env.MCP_ENABLE_LOGS === "true",

  // Diretórios por tipo de pacote
  get npmDir() {
    return path.join(this.serversDir, "npm");
  },

  get pythonDir() {
    return path.join(this.serversDir, "python");
  },

  get rustDir() {
    return path.join(this.serversDir, "rust");
  },
};
