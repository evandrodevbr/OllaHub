import { generateEmbedding } from "./embeddings";
import { getDatabase } from "@/database/client";
import { EmbeddingRepository } from "@/database/repositories/embedding";

export async function semanticSearch(query: string, limit: number = 5) {
  try {
    const queryVector = await generateEmbedding(query);
    const db = getDatabase();
    const embeddingRepo = new EmbeddingRepository(db);

    return await embeddingRepo.searchSimilar(queryVector, limit);
  } catch (error) {
    console.error("Erro na busca semântica:", error);
    return [];
  }
}

export async function addMessageEmbedding(
  messageId: string,
  content: string
): Promise<void> {
  try {
    const vector = await generateEmbedding(content);
    const db = getDatabase();
    const embeddingRepo = new EmbeddingRepository(db);

    await embeddingRepo.create(messageId, vector);
  } catch (error) {
    console.error("Erro ao adicionar embedding:", error);
    // Não falhar silenciosamente - embedding é opcional
  }
}
