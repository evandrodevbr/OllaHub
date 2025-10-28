import Database from "better-sqlite3";
import type { ChatRole } from "@/lib/chat";

export interface Message {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
}

export class MessageRepository {
  constructor(private db: Database.Database) {}

  create(conversationId: string, role: ChatRole, content: string): string {
    const id = crypto.randomUUID();

    this.db
      .prepare(
        `
      INSERT INTO messages (id, conversation_id, role, content, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(id, conversationId, role, content, Date.now());

    return id;
  }

  findByConversation(conversationId: string): Message[] {
    return this.db
      .prepare(
        `
      SELECT * FROM messages 
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `
      )
      .all(conversationId) as Message[];
  }

  findById(id: string): Message | null {
    return this.db
      .prepare(
        `
      SELECT * FROM messages WHERE id = ?
    `
      )
      .get(id) as Message | null;
  }

  updateContent(id: string, content: string): void {
    this.db
      .prepare(
        `
      UPDATE messages 
      SET content = ?
      WHERE id = ?
    `
      )
      .run(content, id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM messages WHERE id = ?").run(id);
  }

  deleteByConversation(conversationId: string): void {
    this.db
      .prepare("DELETE FROM messages WHERE conversation_id = ?")
      .run(conversationId);
  }

  countByConversation(conversationId: string): number {
    const result = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM messages 
      WHERE conversation_id = ?
    `
      )
      .get(conversationId) as { count: number };

    return result.count;
  }
}
