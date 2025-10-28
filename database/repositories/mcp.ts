import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "database", "ollahub.db");
const db = new Database(dbPath);

export class MCPRepository {
  /**
   * Verificar se um MCP está instalado localmente
   */
  static isInstalled(mcpId: string): boolean {
    try {
      const stmt = db.prepare("SELECT id FROM mcp_installations WHERE id = ?");
      const result = stmt.get(mcpId);
      return !!result;
    } catch (error) {
      console.error(`Error checking if MCP ${mcpId} is installed:`, error);
      return false;
    }
  }

  /**
   * Salvar instalação de MCP no banco local
   */
  static saveInstallation(mcpId: string, config: any, tools: any[]): void {
    try {
      const [owner, repo] = mcpId.split('/');
      if (!owner || !repo) {
        throw new Error(`Invalid MCP ID format: ${mcpId}`);
      }

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO mcp_installations 
        (id, owner, repo, name, config, tools, installed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        mcpId,
        owner,
        repo,
        config.name || repo,
        JSON.stringify(config),
        JSON.stringify(tools)
      );

      console.log(`MCP ${mcpId} saved to local database`);
    } catch (error) {
      console.error(`Error saving MCP ${mcpId} installation:`, error);
      throw error;
    }
  }

  /**
   * Remover instalação de MCP do banco local
   */
  static removeInstallation(mcpId: string): void {
    try {
      const stmt = db.prepare("DELETE FROM mcp_installations WHERE id = ?");
      const result = stmt.run(mcpId);
      
      if (result.changes > 0) {
        console.log(`MCP ${mcpId} removed from local database`);
      } else {
        console.log(`MCP ${mcpId} was not found in local database`);
      }
    } catch (error) {
      console.error(`Error removing MCP ${mcpId} installation:`, error);
      throw error;
    }
  }

  /**
   * Listar todos os MCPs instalados localmente
   */
  static listInstalled(): string[] {
    try {
      const stmt = db.prepare("SELECT id FROM mcp_installations ORDER BY installed_at DESC");
      const results = stmt.all() as { id: string }[];
      return results.map(row => row.id);
    } catch (error) {
      console.error("Error listing installed MCPs:", error);
      return [];
    }
  }

  /**
   * Obter configuração local de um MCP
   */
  static getLocalConfig(mcpId: string): any {
    try {
      const stmt = db.prepare("SELECT config FROM mcp_installations WHERE id = ?");
      const result = stmt.get(mcpId) as { config: string } | undefined;
      
      if (result) {
        return JSON.parse(result.config);
      }
      return null;
    } catch (error) {
      console.error(`Error getting local config for MCP ${mcpId}:`, error);
      return null;
    }
  }

  /**
   * Obter ferramentas locais de um MCP
   */
  static getLocalTools(mcpId: string): any[] {
    try {
      const stmt = db.prepare("SELECT tools FROM mcp_installations WHERE id = ?");
      const result = stmt.get(mcpId) as { tools: string } | undefined;
      
      if (result) {
        return JSON.parse(result.tools);
      }
      return [];
    } catch (error) {
      console.error(`Error getting local tools for MCP ${mcpId}:`, error);
      return [];
    }
  }

  /**
   * Obter informações completas de um MCP instalado
   */
  static getInstalledMCP(mcpId: string): any {
    try {
      const stmt = db.prepare(`
        SELECT id, owner, repo, name, config, tools, installed_at, updated_at 
        FROM mcp_installations WHERE id = ?
      `);
      const result = stmt.get(mcpId) as any;
      
      if (result) {
        return {
          ...result,
          config: JSON.parse(result.config),
          tools: JSON.parse(result.tools)
        };
      }
      return null;
    } catch (error) {
      console.error(`Error getting installed MCP ${mcpId}:`, error);
      return null;
    }
  }

  /**
   * Listar todos os MCPs instalados com informações completas
   */
  static listInstalledWithDetails(): any[] {
    try {
      const stmt = db.prepare(`
        SELECT id, owner, repo, name, config, tools, installed_at, updated_at 
        FROM mcp_installations ORDER BY installed_at DESC
      `);
      const results = stmt.all() as any[];
      
      return results.map(row => ({
        ...row,
        config: JSON.parse(row.config),
        tools: JSON.parse(row.tools)
      }));
    } catch (error) {
      console.error("Error listing installed MCPs with details:", error);
      return [];
    }
  }

  /**
   * Atualizar timestamp de um MCP instalado
   */
  static updateTimestamp(mcpId: string): void {
    try {
      const stmt = db.prepare("UPDATE mcp_installations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?");
      stmt.run(mcpId);
    } catch (error) {
      console.error(`Error updating timestamp for MCP ${mcpId}:`, error);
    }
  }

  /**
   * Verificar integridade do banco de dados
   */
  static checkDatabaseIntegrity(): boolean {
    try {
      const result = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
      return result.integrity_check === "ok";
    } catch (error) {
      console.error("Error checking database integrity:", error);
      return false;
    }
  }

  /**
   * Obter estatísticas das instalações
   */
  static getInstallationStats(): any {
    try {
      const totalStmt = db.prepare("SELECT COUNT(*) as total FROM mcp_installations");
      const totalResult = totalStmt.get() as { total: number };

      const recentStmt = db.prepare(`
        SELECT COUNT(*) as recent 
        FROM mcp_installations 
        WHERE installed_at > datetime('now', '-7 days')
      `);
      const recentResult = recentStmt.get() as { recent: number };

      const categoriesStmt = db.prepare(`
        SELECT COUNT(DISTINCT owner) as unique_owners 
        FROM mcp_installations
      `);
      const categoriesResult = categoriesStmt.get() as { unique_owners: number };

      return {
        total: totalResult.total,
        recent: recentResult.recent,
        uniqueOwners: categoriesResult.unique_owners
      };
    } catch (error) {
      console.error("Error getting installation stats:", error);
      return { total: 0, recent: 0, uniqueOwners: 0 };
    }
  }
}
