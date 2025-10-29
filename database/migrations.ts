import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export function runMigrations(db: Database.Database): void {
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

  // Migration 002: Campos de instalação real MCP
  if (!appliedNames.has("002_mcp_installation_fields")) {
    console.log("📋 Aplicando migração: 002_mcp_installation_fields");

    try {
      db.exec(`
        ALTER TABLE mcp_installations ADD COLUMN status TEXT DEFAULT 'pending';
      `);
    } catch (e) {
      // Coluna já existe, ignorar
    }

    try {
      db.exec(`
        ALTER TABLE mcp_installations ADD COLUMN status_message TEXT;
      `);
    } catch (e) {
      // Coluna já existe, ignorar
    }

    try {
      db.exec(`
        ALTER TABLE mcp_installations ADD COLUMN environment_path TEXT;
      `);
    } catch (e) {
      // Coluna já existe, ignorar
    }

    try {
      db.exec(`
        ALTER TABLE mcp_installations ADD COLUMN executable_command TEXT;
      `);
    } catch (e) {
      // Coluna já existe, ignorar
    }

    try {
      db.exec(`
        ALTER TABLE mcp_installations ADD COLUMN validation_result TEXT;
      `);
    } catch (e) {
      // Coluna já existe, ignorar
    }

    try {
      db.exec(`
        ALTER TABLE mcp_installations ADD COLUMN install_logs TEXT;
      `);
    } catch (e) {
      // Coluna já existe, ignorar
    }

    // Registrar migração
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
      "002_mcp_installation_fields",
      Date.now()
    );

    console.log("✅ Migração 002_mcp_installation_fields aplicada");
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
