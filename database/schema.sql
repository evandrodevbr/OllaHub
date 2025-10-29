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

-- Cache de todos os servidores MCP do marketplace
CREATE TABLE IF NOT EXISTS mcp_marketplace_cache (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  content_name TEXT NOT NULL,
  publisher_id TEXT NOT NULL,
  description TEXT,
  category TEXT,
  subfield TEXT,
  field TEXT,
  rating REAL DEFAULT 0,
  review_cnt INTEGER DEFAULT 0,
  content_tag_list TEXT,
  thumbnail_picture TEXT,
  website TEXT,
  detail_url TEXT,
  ext_info JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Metadados do cache (última sincronização, total de registros)
CREATE TABLE IF NOT EXISTS mcp_cache_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX idx_messages_conversation ON messages(conversation_id, timestamp);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX idx_embeddings_message ON embeddings(message_id);
CREATE INDEX idx_mcp_owner_repo ON mcp_installations(owner, repo);
CREATE INDEX idx_mcp_installed_at ON mcp_installations(installed_at DESC);
CREATE INDEX idx_mcp_cache_category ON mcp_marketplace_cache(category);
CREATE INDEX idx_mcp_cache_subfield ON mcp_marketplace_cache(subfield);
CREATE INDEX idx_mcp_cache_rating ON mcp_marketplace_cache(rating DESC);
CREATE INDEX idx_mcp_cache_owner_repo ON mcp_marketplace_cache(owner, repo);
CREATE INDEX idx_mcp_cache_search ON mcp_marketplace_cache(content_name, description);
