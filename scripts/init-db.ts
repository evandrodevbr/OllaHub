import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { ensureModelExists } from "@/lib/ollama";

let db: Database.Database | null = null;

function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), "database", "ollahub.db");

    // Garantir que o diretório existe
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);

    // Configurações de performance
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");
    db.pragma("cache_size = 10000");
    db.pragma("temp_store = memory");
  }
  return db;
}

function runMigrations(db: Database.Database): void {
  // Criar tabela de migrações
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
  `);

  // Verificar migrações aplicadas
  const applied = db.prepare("SELECT name FROM _migrations").all() as Array<{
    name: string;
  }>;
  const appliedNames = new Set(applied.map((m) => m.name));

  // Aplicar migração inicial se não foi aplicada
  if (!appliedNames.has("001_initial_schema")) {
    console.log("📋 Aplicando migração: 001_initial_schema");

    const schemaPath = path.join(process.cwd(), "database", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf-8");

    db.exec(schema);

    // Registrar migração
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
      "001_initial_schema",
      Date.now()
    );

    console.log("✅ Migração 001_initial_schema aplicada");
  }

  // Aplicar migração para tabela MCP se não foi aplicada
  if (!appliedNames.has("002_mcp_installations")) {
    console.log("📋 Aplicando migração: 002_mcp_installations");

    db.exec(`
      -- Tabela para gerenciar MCPs instalados
      CREATE TABLE IF NOT EXISTS mcp_installations (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        config JSON NOT NULL,
        tools JSON,
        installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices para performance
      CREATE INDEX IF NOT EXISTS idx_mcp_owner_repo ON mcp_installations(owner, repo);
      CREATE INDEX IF NOT EXISTS idx_mcp_installed_at ON mcp_installations(installed_at DESC);
    `);

    // Registrar migração
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
      "002_mcp_installations",
      Date.now()
    );

    console.log("✅ Migração 002_mcp_installations aplicada");
  }

  // Aplicar migração para tabela MCP marketplace cache se não foi aplicada
  if (!appliedNames.has("003_mcp_marketplace_cache")) {
    console.log("📋 Aplicando migração: 003_mcp_marketplace_cache");

    db.exec(`
      -- Tabela principal de cache
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

      -- Metadados
      CREATE TABLE IF NOT EXISTS mcp_cache_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices
      CREATE INDEX IF NOT EXISTS idx_mcp_cache_category ON mcp_marketplace_cache(category);
      CREATE INDEX IF NOT EXISTS idx_mcp_cache_subfield ON mcp_marketplace_cache(subfield);
      CREATE INDEX IF NOT EXISTS idx_mcp_cache_rating ON mcp_marketplace_cache(rating DESC);
      CREATE INDEX IF NOT EXISTS idx_mcp_cache_owner_repo ON mcp_marketplace_cache(owner, repo);
      CREATE INDEX IF NOT EXISTS idx_mcp_cache_search ON mcp_marketplace_cache(content_name, description);
    `);

    // Registrar migração
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
      "003_mcp_marketplace_cache",
      Date.now()
    );

    console.log("✅ Migração 003_mcp_marketplace_cache aplicada");
  }

  // Inicializar extensão vetorial se disponível
  try {
    const extPath = path.join(
      process.cwd(),
      "database",
      "extensions",
      "vector.so"
    );
    if (fs.existsSync(extPath)) {
      db.loadExtension(extPath);

      // Inicializar índice vetorial
      db.exec(`
        SELECT vector_init('embeddings', 'vector', 'type=FLOAT32,dimension=384');
      `);

      // Quantizar para busca mais rápida
      db.exec(`
        SELECT vector_quantize('embeddings', 'vector');
      `);

      console.log("🔍 Extensão vetorial carregada e inicializada");
    } else {
      console.log(
        "⚠️  Extensão vetorial não encontrada - busca vetorial desabilitada"
      );
    }
  } catch (error) {
    console.log("⚠️  Erro ao carregar extensão vetorial:", error);
  }
}

export async function initializeDatabase(): Promise<void> {
  console.log("🔧 Inicializando banco de dados OllaHub...");

  try {
    // Conectar ao banco
    const db = getDatabase();

    // Executar migrações
    runMigrations(db);

    console.log("✅ Banco de dados inicializado com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao inicializar banco de dados:", error);
    throw error;
  }
}

export async function initializeTitleModel(): Promise<void> {
  console.log("🤖 Verificando modelo para geração de títulos...");

  try {
    await ensureModelExists(
      "qwen2.5:0.5b",
      "Este modelo será usado para gerar títulos automáticos das conversas"
    );
    console.log("✅ Modelo de título pronto!");
  } catch (error) {
    console.error("❌ Erro ao inicializar modelo de título:", error);
    console.log("⚠️  Títulos de conversa podem não funcionar corretamente");
  }
}

export async function initializeEmbeddingModel(): Promise<void> {
  console.log("🔍 Verificando modelo para embeddings...");

  try {
    await ensureModelExists(
      "nomic-embed-text",
      "Este modelo será usado para busca vetorial das mensagens (274MB - 768 dimensões)"
    );
    console.log("✅ Modelo de embedding pronto!");
  } catch (error) {
    console.error("❌ Erro ao inicializar modelo de embedding:", error);
    console.log("⚠️  Busca vetorial desabilitada - usando fallback");
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  Promise.all([
    initializeDatabase(),
    initializeTitleModel(),
    initializeEmbeddingModel(),
  ])
    .then(async () => {
      console.log("🎉 Inicialização concluída");
      
      // Iniciar sincronização do marketplace se necessário
      try {
        const { MCPSyncService } = await import("@/lib/services/mcp-sync");
        const { MCPCacheRepository } = await import("@/database/repositories/mcp-cache");
        
        if (MCPCacheRepository.needsSync()) {
          console.log("🔄 Iniciando sincronização inicial do marketplace...");
          MCPSyncService.backgroundSync();
        } else {
          console.log("✅ Cache do marketplace já está atualizado");
        }
      } catch (error) {
        console.log("⚠️  Não foi possível inicializar sincronização do marketplace:", error);
      }
      
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Falha na inicialização:", error);
      process.exit(1);
    });
}
