import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "database", "ollahub.db");
const db = new Database(dbPath);

console.log("🔧 Adding FTS5 support to MCP cache...");

// Criar tabela FTS5
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS mcp_search_fts USING fts5(
    id UNINDEXED,
    content_name,
    description,
    content_tag_list,
    publisher_id,
    content=mcp_marketplace_cache,
    content_rowid=rowid
  );
`);

// Popular com dados existentes
console.log("📦 Populating FTS index...");
db.exec(`
  INSERT INTO mcp_search_fts(rowid, id, content_name, description, content_tag_list, publisher_id)
  SELECT rowid, id, content_name, description, content_tag_list, publisher_id
  FROM mcp_marketplace_cache;
`);

// Criar triggers
console.log("⚡ Creating triggers...");
db.exec(`
  CREATE TRIGGER IF NOT EXISTS mcp_fts_insert AFTER INSERT ON mcp_marketplace_cache BEGIN
    INSERT INTO mcp_search_fts(rowid, id, content_name, description, content_tag_list, publisher_id)
    VALUES (new.rowid, new.id, new.content_name, new.description, new.content_tag_list, new.publisher_id);
  END;

  CREATE TRIGGER IF NOT EXISTS mcp_fts_update AFTER UPDATE ON mcp_marketplace_cache BEGIN
    UPDATE mcp_search_fts 
    SET content_name = new.content_name, 
        description = new.description,
        content_tag_list = new.content_tag_list,
        publisher_id = new.publisher_id
    WHERE rowid = old.rowid;
  END;

  CREATE TRIGGER IF NOT EXISTS mcp_fts_delete AFTER DELETE ON mcp_marketplace_cache BEGIN
    DELETE FROM mcp_search_fts WHERE rowid = old.rowid;
  END;
`);

// Criar índices compostos
console.log("🔍 Creating composite indexes...");
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_mcp_cache_category_rating 
  ON mcp_marketplace_cache(category, rating DESC);
  
  CREATE INDEX IF NOT EXISTS idx_mcp_cache_subfield_rating 
  ON mcp_marketplace_cache(subfield, rating DESC);
  
  CREATE INDEX IF NOT EXISTS idx_mcp_cache_updated_rating 
  ON mcp_marketplace_cache(updated_at DESC, rating DESC);
`);

console.log("✅ FTS5 migration completed!");
db.close();
