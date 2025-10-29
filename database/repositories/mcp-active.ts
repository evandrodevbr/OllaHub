/**
 * Repositório para gerenciar MCPs ativos por conversa/usuário
 */

import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "database", "ollahub.db");
const db = new Database(dbPath);

export interface ActiveMCP {
  id: string;
  conversation_id: string;
  mcp_id: string;
  enabled: boolean;
  config?: any;
  created_at: string;
}

export class MCPActiveRepository {
  /**
   * Salvar MCPs ativos para uma conversa
   * @param conversationId ID da conversa
   * @param mcpIds Array de IDs de MCPs ativos
   */
  static saveActiveMCPs(conversationId: string, mcpIds: string[]): void {
    try {
      // Primeiro, remover todas as entradas antigas da conversa
      const deleteStmt = db.prepare(
        "DELETE FROM active_mcps WHERE conversation_id = ?"
      );
      deleteStmt.run(conversationId);

      // Inserir novos MCPs ativos
      const insertStmt = db.prepare(`
        INSERT INTO active_mcps (conversation_id, mcp_id, enabled, created_at)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      `);

      for (const mcpId of mcpIds) {
        insertStmt.run(conversationId, mcpId);
      }

      console.log(
        `Saved ${mcpIds.length} active MCPs for conversation ${conversationId}`
      );
    } catch (error) {
      console.error("Error saving active MCPs:", error);
      throw error;
    }
  }

  /**
   * Obter MCPs ativos de uma conversa
   * @param conversationId ID da conversa
   * @returns Array de IDs de MCPs ativos
   */
  static getActiveMCPs(conversationId: string): string[] {
    try {
      const stmt = db.prepare(`
        SELECT mcp_id FROM active_mcps 
        WHERE conversation_id = ? AND enabled = 1
        ORDER BY created_at DESC
      `);

      const results = stmt.all(conversationId) as { mcp_id: string }[];
      return results.map((row) => row.mcp_id);
    } catch (error) {
      console.error("Error getting active MCPs:", error);
      return [];
    }
  }

  /**
   * Ativar/desativar um MCP específico para uma conversa
   * @param conversationId ID da conversa
   * @param mcpId ID do MCP
   * @param enabled true para ativar, false para desativar
   */
  static toggleMCP(
    conversationId: string,
    mcpId: string,
    enabled: boolean
  ): void {
    try {
      // Verificar se já existe
      const checkStmt = db.prepare(`
        SELECT id FROM active_mcps 
        WHERE conversation_id = ? AND mcp_id = ?
      `);
      const existing = checkStmt.get(conversationId, mcpId);

      if (existing) {
        // Atualizar
        const updateStmt = db.prepare(`
          UPDATE active_mcps SET enabled = ?
          WHERE conversation_id = ? AND mcp_id = ?
        `);
        updateStmt.run(enabled ? 1 : 0, conversationId, mcpId);
      } else {
        // Inserir
        const insertStmt = db.prepare(`
          INSERT INTO active_mcps (conversation_id, mcp_id, enabled, created_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `);
        insertStmt.run(conversationId, mcpId, enabled ? 1 : 0);
      }

      console.log(
        `MCP ${mcpId} ${
          enabled ? "enabled" : "disabled"
        } for conversation ${conversationId}`
      );
    } catch (error) {
      console.error("Error toggling MCP:", error);
      throw error;
    }
  }

  /**
   * Limpar MCPs ativos de uma conversa
   * @param conversationId ID da conversa
   */
  static clearActiveMCPs(conversationId: string): void {
    try {
      const stmt = db.prepare(
        "DELETE FROM active_mcps WHERE conversation_id = ?"
      );
      stmt.run(conversationId);
      console.log(`Cleared active MCPs for conversation ${conversationId}`);
    } catch (error) {
      console.error("Error clearing active MCPs:", error);
      throw error;
    }
  }

  /**
   * Obter todas as conversas que usam um MCP específico
   * @param mcpId ID do MCP
   * @returns Array de IDs de conversas
   */
  static getConversationsUsingMCP(mcpId: string): string[] {
    try {
      const stmt = db.prepare(`
        SELECT DISTINCT conversation_id FROM active_mcps 
        WHERE mcp_id = ? AND enabled = 1
      `);

      const results = stmt.all(mcpId) as { conversation_id: string }[];
      return results.map((row) => row.conversation_id);
    } catch (error) {
      console.error("Error getting conversations using MCP:", error);
      return [];
    }
  }
}
