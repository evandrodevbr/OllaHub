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

-- Índices para performance
CREATE INDEX idx_messages_conversation ON messages(conversation_id, timestamp);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX idx_embeddings_message ON embeddings(message_id);
