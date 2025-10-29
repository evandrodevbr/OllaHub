-- Schema inicial do banco de dados OllaHub
-- Conversas
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Mensagens
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Embeddings vetoriais (384 dimensões do Ollama)
CREATE TABLE embeddings (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    vector BLOB NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- Tabela para gerenciar MCPs instalados
CREATE TABLE IF NOT EXISTS mcp_installations (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  name TEXT NOT NULL,
  config JSON NOT NULL,
  tools JSON,
  status TEXT DEFAULT 'pending',
  status_message TEXT,
  environment_path TEXT,
  executable_command TEXT,
  validation_result TEXT,
  install_logs TEXT,
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Marketplace removido: tabelas e índices relacionados ao cache do marketplace foram descontinuados

-- Tabela para rastrear MCPs ativos por conversa
CREATE TABLE IF NOT EXISTS active_mcps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  mcp_id TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  UNIQUE(conversation_id, mcp_id)
);

CREATE INDEX IF NOT EXISTS idx_active_mcps_conversation ON active_mcps(conversation_id);
CREATE INDEX IF NOT EXISTS idx_active_mcps_mcp ON active_mcps(mcp_id);

-- Índices para performance
CREATE INDEX idx_messages_conversation ON messages(conversation_id, timestamp);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX idx_embeddings_message ON embeddings(message_id);
CREATE INDEX idx_mcp_owner_repo ON mcp_installations(owner, repo);
CREATE INDEX idx_mcp_installed_at ON mcp_installations(installed_at DESC);
-- Índices do marketplace removidos
