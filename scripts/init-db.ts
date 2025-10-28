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
      "Este modelo será usado para busca vetorial das mensagens"
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
    .then(() => {
      console.log("🎉 Inicialização concluída");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Falha na inicialização:", error);
      process.exit(1);
    });
}
