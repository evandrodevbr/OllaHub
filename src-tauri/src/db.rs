use rusqlite::{Connection, Result as SqliteResult, params};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub emoji: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub id: Option<i64>,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub metadata: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Resultado de busca de sessões com contagem de matches
#[derive(Debug, Clone)]
pub struct SearchSessionResult {
    pub session: ChatSession,
    pub match_count: i64,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    /// Cria ou abre conexão com o banco de dados
    pub fn new(app_handle: &AppHandle) -> SqliteResult<Self> {
        let app_data_dir = app_handle.path()
            .app_data_dir()
            .map_err(|e| {
                rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                    Some(format!("Failed to get app data dir: {}", e))
                )
            })?;
        
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| {
                rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                    Some(format!("Failed to create app data dir: {}", e))
                )
            })?;
        
        let db_path = app_data_dir.join("ollahub.db");
        let conn = Connection::open(&db_path)?;
        
        // Otimizações de performance do SQLite
        // WAL mode permite leituras e escritas simultâneas (evita bloqueio da UI)
        // synchronous=NORMAL reduz fsync sem perder segurança
        // cache_size maior acelera operações frequentes
        // temp_store=MEMORY usa RAM para tabelas temporárias
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA cache_size=10000;
             PRAGMA temp_store=MEMORY;
             PRAGMA foreign_keys=ON;"
        )?;
        
        let db = Self { conn };
        db.init_schema()?;
        
        Ok(db)
    }
    
    /// Inicializa o schema do banco de dados
    fn init_schema(&self) -> SqliteResult<()> {
        // Tabela de sessões
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                emoji TEXT DEFAULT '💬',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // Tabela de mensagens
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;
        
        // Tabela de documentos RAG
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS rag_documents (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                source_url TEXT,
                content TEXT NOT NULL,
                embedding BLOB,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )?;
        
        // Índices para performance
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)",
            [],
        )?;
        
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_rag_session_id ON rag_documents(session_id)",
            [],
        )?;
        
        // Índice para ordenação por updated_at
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC)",
            [],
        )?;
        
        // Inicializar FTS (Full-Text Search)
        self.init_fts_schema()?;
        
        Ok(())
    }
    
    /// Inicializa tabelas FTS5 para busca de texto completo
    fn init_fts_schema(&self) -> SqliteResult<()> {
        // Tabela FTS para títulos de sessões
        self.conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
                id UNINDEXED,
                title,
                content='sessions',
                content_rowid='rowid'
            )",
            [],
        )?;
        
        // Tabela FTS para conteúdo de mensagens
        self.conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                session_id UNINDEXED,
                content,
                content='messages',
                content_rowid='rowid'
            )",
            [],
        )?;
        
        // Triggers para manter FTS sincronizado com tabelas principais
        self.create_fts_triggers()?;
        
        // Popular tabelas FTS com dados existentes (se necessário)
        self.populate_fts_tables()?;
        
        Ok(())
    }
    
    /// Cria triggers para manter tabelas FTS sincronizadas
    fn create_fts_triggers(&self) -> SqliteResult<()> {
        // Trigger para inserir em sessions_fts quando nova sessão é criada
        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS sessions_fts_insert AFTER INSERT ON sessions BEGIN
                INSERT INTO sessions_fts(rowid, id, title) VALUES (new.rowid, new.id, new.title);
            END",
            [],
        )?;
        
        // Trigger para atualizar sessions_fts quando sessão é atualizada
        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS sessions_fts_update AFTER UPDATE ON sessions BEGIN
                INSERT INTO sessions_fts(sessions_fts, rowid, id, title) VALUES ('delete', old.rowid, old.id, old.title);
                INSERT INTO sessions_fts(rowid, id, title) VALUES (new.rowid, new.id, new.title);
            END",
            [],
        )?;
        
        // Trigger para deletar de sessions_fts quando sessão é deletada
        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS sessions_fts_delete AFTER DELETE ON sessions BEGIN
                INSERT INTO sessions_fts(sessions_fts, rowid, id, title) VALUES ('delete', old.rowid, old.id, old.title);
            END",
            [],
        )?;
        
        // Trigger para inserir em messages_fts quando nova mensagem é criada
        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
                INSERT INTO messages_fts(rowid, session_id, content) VALUES (new.rowid, new.session_id, new.content);
            END",
            [],
        )?;
        
        // Trigger para atualizar messages_fts quando mensagem é atualizada
        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, session_id, content) VALUES ('delete', old.rowid, old.session_id, old.content);
                INSERT INTO messages_fts(rowid, session_id, content) VALUES (new.rowid, new.session_id, new.content);
            END",
            [],
        )?;
        
        // Trigger para deletar de messages_fts quando mensagem é deletada
        self.conn.execute(
            "CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, session_id, content) VALUES ('delete', old.rowid, old.session_id, old.content);
            END",
            [],
        )?;
        
        Ok(())
    }
    
    /// Popula tabelas FTS com dados existentes
    fn populate_fts_tables(&self) -> SqliteResult<()> {
        // Verificar se sessions_fts já tem dados
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM sessions_fts",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        // Se vazio, popular com dados existentes
        if count == 0 {
            self.conn.execute(
                "INSERT INTO sessions_fts(rowid, id, title)
                 SELECT rowid, id, title FROM sessions",
                [],
            )?;
        }
        
        // Verificar se messages_fts já tem dados
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM messages_fts",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        // Se vazio, popular com dados existentes
        if count == 0 {
            self.conn.execute(
                "INSERT INTO messages_fts(rowid, session_id, content)
                 SELECT rowid, session_id, content FROM messages",
                [],
            )?;
        }
        
        Ok(())
    }
    
    /// Cria uma nova sessão de chat
    pub fn create_session(&self, session: &ChatSession) -> SqliteResult<()> {
        self.conn.execute(
            "INSERT INTO sessions (id, title, emoji, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET 
                title = ?2, 
                emoji = ?3, 
                updated_at = ?5",
            params![
                session.id,
                session.title,
                session.emoji,
                session.created_at.to_rfc3339(),
                session.updated_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }
    
    /// Atualiza uma sessão existente
    pub fn update_session(&self, session: &ChatSession) -> SqliteResult<()> {
        self.conn.execute(
            "UPDATE sessions SET title = ?1, emoji = ?2, updated_at = ?3 WHERE id = ?4",
            params![
                session.title,
                session.emoji,
                session.updated_at.to_rfc3339(),
                session.id
            ],
        )?;
        Ok(())
    }
    
    /// Busca uma sessão por ID
    pub fn get_session(&self, session_id: &str) -> SqliteResult<Option<ChatSession>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, emoji, created_at, updated_at FROM sessions WHERE id = ?1"
        )?;
        
        let mut rows = stmt.query_map(params![session_id], |row| {
            Ok(ChatSession {
                id: row.get(0)?,
                title: row.get(1)?,
                emoji: row.get(2)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(3, "TEXT".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
                updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(4, "TEXT".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
            })
        })?;
        
        if let Some(row) = rows.next() {
            row.map(Some)
        } else {
            Ok(None)
        }
    }
    
    /// Salva uma sessão (create ou update)
    pub fn save_session(&self, session: &ChatSession) -> SqliteResult<()> {
        self.create_session(session)
    }
    
    /// Lista todas as sessões ordenadas por updated_at DESC
    pub fn list_sessions(&self) -> SqliteResult<Vec<ChatSession>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, emoji, created_at, updated_at FROM sessions ORDER BY updated_at DESC"
        )?;
        
        let rows = stmt.query_map([], |row| {
            Ok(ChatSession {
                id: row.get(0)?,
                title: row.get(1)?,
                emoji: row.get(2)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(3, "TEXT".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
                updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(4, "TEXT".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
            })
        })?;
        
        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row?);
        }
        Ok(sessions)
    }
    
    /// Deleta uma sessão e todas as suas mensagens
    pub fn delete_session(&self, session_id: &str) -> SqliteResult<()> {
        self.conn.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])?;
        Ok(())
    }
    
    /// Adiciona uma mensagem a uma sessão
    pub fn add_message(&self, message: &ChatMessage) -> SqliteResult<i64> {
        self.conn.execute(
            "INSERT INTO messages (session_id, role, content, metadata, created_at) 
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                message.session_id,
                message.role,
                message.content,
                message.metadata,
                message.created_at.to_rfc3339()
            ],
        )?;
        
        // Atualizar updated_at da sessão
        self.conn.execute(
            "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
            params![
                message.created_at.to_rfc3339(),
                message.session_id
            ],
        )?;
        
        Ok(self.conn.last_insert_rowid())
    }
    
    /// Salva múltiplas mensagens de uma sessão em uma transação
    /// 
    /// Remove mensagens existentes da sessão antes de inserir as novas
    /// para garantir que não haja duplicatas.
    pub fn save_messages_batch(
        &self,
        session_id: &str,
        messages: &[ChatMessage],
    ) -> SqliteResult<()> {
        // Usar execute_batch para executar múltiplas operações atomicamente
        // WAL mode permite isso de forma segura mesmo sem transação explícita
        
        // Remover mensagens existentes da sessão (para evitar duplicatas)
        self.conn.execute(
            "DELETE FROM messages WHERE session_id = ?1",
            params![session_id],
        )?;
        
        // Inserir todas as mensagens
        let mut stmt = self.conn.prepare(
            "INSERT INTO messages (session_id, role, content, metadata, created_at) 
             VALUES (?1, ?2, ?3, ?4, ?5)"
        )?;
        
        for message in messages {
            stmt.execute(params![
                message.session_id,
                message.role,
                message.content,
                message.metadata,
                message.created_at.to_rfc3339()
            ])?;
        }
        
        // Atualizar updated_at da sessão com a data da última mensagem
        if let Some(last_message) = messages.last() {
            self.conn.execute(
                "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
                params![
                    last_message.created_at.to_rfc3339(),
                    session_id
                ],
            )?;
        }
        
        Ok(())
    }
    
    /// Busca todas as mensagens de uma sessão
    pub fn get_messages(&self, session_id: &str) -> SqliteResult<Vec<ChatMessage>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, role, content, metadata, created_at 
             FROM messages 
             WHERE session_id = ?1 
             ORDER BY created_at ASC"
        )?;
        
        let rows = stmt.query_map(params![session_id], |row| {
            Ok(ChatMessage {
                id: Some(row.get(0)?),
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                metadata: row.get(4)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(5)?)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(5, "TEXT".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
            })
        })?;
        
        let mut messages = Vec::new();
        for row in rows {
            messages.push(row?);
        }
        Ok(messages)
    }
    
    /// Busca mensagens de uma sessão com paginação (lazy loading)
    /// 
    /// Retorna as últimas `limit` mensagens a partir do `offset`.
    /// O offset conta do final (0 = últimas mensagens, 20 = 20 mensagens antes das últimas).
    /// 
    /// Parâmetros:
    /// - session_id: ID da sessão
    /// - limit: número máximo de mensagens a retornar
    /// - offset: número de mensagens a pular do final (0 = começar das últimas)
    /// 
    /// Retorna: (mensagens em ordem ASC, total_count, has_more)
    pub fn get_messages_paginated(
        &self,
        session_id: &str,
        limit: usize,
        offset: usize,
    ) -> SqliteResult<(Vec<ChatMessage>, usize, bool)> {
        // Primeiro, obter o total de mensagens
        let total_count: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;
        
        // Se não há mensagens, retornar vazio
        if total_count == 0 {
            return Ok((Vec::new(), 0, false));
        }
        
        // Estratégia: usar subquery para pegar as últimas N mensagens ordenadas DESC,
        // depois ordenar ASC para manter ordem cronológica
        // 
        // Se offset=0 e limit=30: queremos as últimas 30 mensagens
        // Se offset=30 e limit=30: queremos as 30 mensagens antes das últimas 30
        let real_limit = std::cmp::min(limit, total_count.saturating_sub(offset));
        
        if real_limit == 0 {
            return Ok((Vec::new(), total_count, false));
        }
        
        // Query: pegar as últimas (offset + limit) mensagens ordenadas DESC,
        // depois ordenar ASC e pegar as primeiras 'limit' (que são as mais antigas do conjunto)
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, role, content, metadata, created_at 
             FROM (
                 SELECT id, session_id, role, content, metadata, created_at
                 FROM messages 
                 WHERE session_id = ?1 
                 ORDER BY created_at DESC
                 LIMIT ?2
             ) AS recent_messages
             ORDER BY created_at ASC
             LIMIT ?3"
        )?;
        
        // Precisamos pegar (offset + limit) mensagens do final para depois pegar as primeiras 'limit'
        let fetch_limit = offset + limit;
        
        let rows = stmt.query_map(params![session_id, fetch_limit, real_limit], |row| {
            Ok(ChatMessage {
                id: Some(row.get(0)?),
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                metadata: row.get(4)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(5)?)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(5, "TEXT".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Utc),
            })
        })?;
        
        let mut messages = Vec::new();
        for row in rows {
            messages.push(row?);
        }
        
        // has_more = ainda há mensagens mais antigas para carregar
        let has_more = offset + messages.len() < total_count;
        
        Ok((messages, total_count, has_more))
    }
    
    /// Salva um documento RAG
    pub fn save_rag_document(
        &self,
        id: &str,
        session_id: Option<&str>,
        source_url: Option<&str>,
        content: &str,
        embedding: Option<&[u8]>,
    ) -> SqliteResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO rag_documents (id, session_id, source_url, content, embedding, created_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                session_id,
                source_url,
                content,
                embedding,
                Utc::now().to_rfc3339()
            ],
        )?;
        Ok(())
    }
    
    /// Busca documentos RAG por sessão
    pub fn get_rag_documents(&self, session_id: &str) -> SqliteResult<Vec<(String, String, Option<String>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, content, source_url FROM rag_documents WHERE session_id = ?1"
        )?;
        
        let rows = stmt.query_map(params![session_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
            ))
        })?;
        
        let mut docs = Vec::new();
        for row in rows {
            docs.push(row?);
        }
        Ok(docs)
    }
    
    /// Busca sessões por query (título ou conteúdo de mensagens)
    /// Retorna resultados ordenados por relevância (match no título > match no conteúdo)
    /// Inclui contagem de matches para navegação
    pub fn search_sessions(&self, query: &str, limit: usize) -> SqliteResult<Vec<SearchSessionResult>> {
        if query.trim().is_empty() {
            // Se query vazia, retornar todas as sessões ordenadas por updated_at com match_count = 0
            let sessions = self.list_sessions()?;
            return Ok(sessions.into_iter().map(|session| SearchSessionResult {
                session,
                match_count: 0,
            }).collect());
        }
        
        // Escapar caracteres especiais para FTS5
        let escaped_query = query.replace('"', "\"\"");
        let fts_query = format!("\"{}\"", escaped_query);
        
        // Busca simplificada: primeiro buscar por título, depois por conteúdo
        // Usando abordagem em duas etapas para evitar problemas com bm25 em CTEs
        
        // Etapa 1: Buscar sessões por título (FTS5)
        let mut title_sessions: Vec<SearchSessionResult> = Vec::new();
        {
            let mut stmt = self.conn.prepare(
                "SELECT s.id, s.title, s.emoji, s.created_at, s.updated_at
                 FROM sessions s
                 JOIN sessions_fts ON s.rowid = sessions_fts.rowid
                 WHERE sessions_fts MATCH ?1
                 ORDER BY s.updated_at DESC
                 LIMIT ?2"
            )?;
            
            let rows = stmt.query_map(params![&fts_query, limit], |row| {
                Ok(SearchSessionResult {
                    session: ChatSession {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        emoji: row.get(2)?,
                        created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                            .map_err(|_| rusqlite::Error::InvalidColumnType(3, "TEXT".to_string(), rusqlite::types::Type::Text))?
                            .with_timezone(&Utc),
                        updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                            .map_err(|_| rusqlite::Error::InvalidColumnType(4, "TEXT".to_string(), rusqlite::types::Type::Text))?
                            .with_timezone(&Utc),
                    },
                    match_count: 1, // Match no título conta como 1
                })
            })?;
            
            for row in rows {
                title_sessions.push(row?);
            }
        }
        
        // Etapa 2: Buscar sessões por conteúdo de mensagens (FTS5)
        let mut content_sessions: Vec<(String, i64)> = Vec::new(); // (session_id, match_count)
        {
            let mut stmt = self.conn.prepare(
                "SELECT m.session_id, COUNT(*) as match_count
                 FROM messages m
                 JOIN messages_fts ON m.rowid = messages_fts.rowid
                 WHERE messages_fts MATCH ?1
                 GROUP BY m.session_id
                 ORDER BY match_count DESC
                 LIMIT ?2"
            )?;
            
            let rows = stmt.query_map(params![&fts_query, limit], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?;
            
            for row in rows {
                content_sessions.push(row?);
            }
        }
        
        // Combinar resultados: priorizar matches por título, adicionar matches por conteúdo
        let mut session_map: std::collections::HashMap<String, SearchSessionResult> = std::collections::HashMap::new();
        
        // Adicionar sessões encontradas por título
        for session in title_sessions {
            session_map.insert(session.session.id.clone(), session);
        }
        
        // Adicionar ou atualizar com sessões encontradas por conteúdo
        for (session_id, match_count) in content_sessions {
            if let Some(existing) = session_map.get_mut(&session_id) {
                // Atualizar match_count se já existe
                existing.match_count = match_count;
            } else {
                // Buscar dados da sessão
                if let Ok(Some(session)) = self.get_session(&session_id) {
                    session_map.insert(session_id, SearchSessionResult {
                        session,
                        match_count,
                    });
                }
            }
        }
        
        // Converter para vetor e ordenar por updated_at
        let mut sessions: Vec<SearchSessionResult> = session_map.into_values().collect();
        sessions.sort_by(|a, b| b.session.updated_at.cmp(&a.session.updated_at));
        
        // Se não encontrou resultados com FTS, tentar busca simples com LIKE (fallback)
        if sessions.is_empty() {
            let mut stmt = self.conn.prepare(
                "SELECT s.id, s.title, s.emoji, s.created_at, s.updated_at,
                        COUNT(CASE WHEN m.content LIKE ?1 THEN 1 END) as match_count
                 FROM sessions s
                 LEFT JOIN messages m ON s.id = m.session_id
                 WHERE s.title LIKE ?1 OR m.content LIKE ?1
                 GROUP BY s.id, s.title, s.emoji, s.created_at, s.updated_at
                 ORDER BY s.updated_at DESC
                 LIMIT ?2"
            )?;
            
            let like_query = format!("%{}%", query);
            let rows = stmt.query_map(params![like_query, limit], |row| {
                Ok(SearchSessionResult {
                    session: ChatSession {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        emoji: row.get(2)?,
                        created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                            .map_err(|_| rusqlite::Error::InvalidColumnType(3, "TEXT".to_string(), rusqlite::types::Type::Text))?
                            .with_timezone(&Utc),
                        updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                            .map_err(|_| rusqlite::Error::InvalidColumnType(4, "TEXT".to_string(), rusqlite::types::Type::Text))?
                            .with_timezone(&Utc),
                    },
                    match_count: row.get(5)?,
                })
            })?;
            
            for row in rows {
                sessions.push(row?);
            }
        }
        
        Ok(sessions)
    }
}

