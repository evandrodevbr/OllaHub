import Database from "better-sqlite3";

export interface Conversation {
  id: string;
  title: string | null;
  model: string;
  created_at: number;
  updated_at: number;
}

export class ConversationRepository {
  constructor(private db: Database.Database) {}

  create(model: string, title?: string): string {
    const id = crypto.randomUUID();
    const now = Date.now();

    this.db
      .prepare(
        `
      INSERT INTO conversations (id, title, model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(id, title || "Nova conversa", model, now, now);

    return id;
  }

  findAll(): Conversation[] {
    return this.db
      .prepare(
        `
      SELECT * FROM conversations 
      ORDER BY updated_at DESC
    `
      )
      .all() as Conversation[];
  }

  findById(id: string): Conversation | null {
    return this.db
      .prepare(
        `
      SELECT * FROM conversations WHERE id = ?
    `
      )
      .get(id) as Conversation | null;
  }

  updateTitle(id: string, title: string): void {
    this.db
      .prepare(
        `
      UPDATE conversations 
      SET title = ?, updated_at = ?
      WHERE id = ?
    `
      )
      .run(title, Date.now(), id);
  }

  updateTimestamp(id: string): void {
    this.db
      .prepare(
        `
      UPDATE conversations 
      SET updated_at = ?
      WHERE id = ?
    `
      )
      .run(Date.now(), id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  }
}
