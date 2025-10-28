import Database from "better-sqlite3";

export interface Embedding {
  id: string;
  message_id: string;
  vector: Buffer;
}

export interface SearchResult {
  id: string;
  content: string;
  role: string;
  distance: number;
  conversation_id: string;
}

export class EmbeddingRepository {
  constructor(private db: Database.Database) {}

  async create(messageId: string, vector: Float32Array): Promise<void> {
    const id = crypto.randomUUID();
    const blob = Buffer.from(vector.buffer);

    this.db
      .prepare(
        `
      INSERT INTO embeddings (id, message_id, vector)
      VALUES (?, ?, ?)
    `
      )
      .run(id, messageId, blob);
  }

  async searchSimilar(
    queryVector: Float32Array,
    limit: number = 5
  ): Promise<SearchResult[]> {
    const queryBlob = Buffer.from(queryVector.buffer);

    try {
      // Tentar busca vetorial se extensão estiver disponível
      return this.db
        .prepare(
          `
        SELECT 
          m.id, m.content, m.role, m.conversation_id,
          vector_distance(e.vector, ?) as distance
        FROM embeddings e
        JOIN messages m ON m.id = e.message_id
        ORDER BY distance ASC
        LIMIT ?
      `
        )
        .all(queryBlob, limit) as SearchResult[];
    } catch (error) {
      console.warn(
        "Busca vetorial não disponível, usando busca simples:",
        error
      );

      // Fallback: busca simples por conteúdo
      return this.db
        .prepare(
          `
        SELECT 
          m.id, m.content, m.role, m.conversation_id,
          0.0 as distance
        FROM messages m
        WHERE m.content LIKE ?
        ORDER BY m.timestamp DESC
        LIMIT ?
      `
        )
        .all(`%${queryVector.toString()}%`, limit) as SearchResult[];
    }
  }

  findByMessage(messageId: string): Embedding | null {
    return this.db
      .prepare(
        `
      SELECT * FROM embeddings WHERE message_id = ?
    `
      )
      .get(messageId) as Embedding | null;
  }

  deleteByMessage(messageId: string): void {
    this.db
      .prepare("DELETE FROM embeddings WHERE message_id = ?")
      .run(messageId);
  }

  count(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM embeddings")
      .get() as { count: number };
    return result.count;
  }
}
