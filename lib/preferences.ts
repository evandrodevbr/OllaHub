import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let db: Database.Database | null = null;

export async function getPreferencesDb(): Promise<Database.Database> {
  if (!db) {
    try {
      const dbPath = path.join(
        process.cwd(),
        "database",
        "ollahub-preferences.db"
      );

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

      // Criar tabela de preferências se não existir
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          user_id TEXT PRIMARY KEY,
          preferences TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      console.log("✅ Banco de preferências SQLite conectado com sucesso");
    } catch (error) {
      console.warn("⚠️ Erro ao conectar banco de preferências:", error);
      throw error;
    }
  }
  return db;
}

export async function getPreferences(userId: string = "default"): Promise<any> {
  try {
    const database = await getPreferencesDb();
    const stmt = database.prepare(
      "SELECT preferences FROM user_preferences WHERE user_id = ?"
    );
    const result = stmt.get(userId) as { preferences: string } | undefined;

    if (result) {
      return JSON.parse(result.preferences);
    }

    // Retornar preferências padrão
    return {
      selectedModel: null,
      systemPrompt: "",
      device: "auto",
      gpuIndex: 0,
      numGpu: 1,
    };
  } catch (error) {
    console.error("Erro ao buscar preferências:", error);
    throw error;
  }
}

export async function setPreferences(
  userId: string = "default",
  preferences: any
): Promise<void> {
  try {
    const database = await getPreferencesDb();
    const stmt = database.prepare(`
      INSERT OR REPLACE INTO user_preferences (user_id, preferences, updated_at)
      VALUES (?, ?, ?)
    `);

    stmt.run(userId, JSON.stringify(preferences), Date.now());
    console.log("✅ Preferências salvas no SQLite");
  } catch (error) {
    console.error("Erro ao salvar preferências:", error);
    throw error;
  }
}

export function closePreferencesDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
