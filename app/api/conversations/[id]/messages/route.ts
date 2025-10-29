import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/database/client";
import { MessageRepository } from "@/database/repositories/message";
import { ConversationRepository } from "@/database/repositories/conversation";
import { addMessageEmbedding } from "@/lib/vector-search";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const beforeParam = url.searchParams.get("before");

    const limit = Math.min(Math.max(Number(limitParam) || 0, 1), 200) || 50;
    const beforeTs = beforeParam ? Number(beforeParam) : undefined;

    const db = getDatabase();
    const messageRepo = new MessageRepository(db);

    const messages = messageRepo.findByConversationPaged(id, limit, beforeTs);
    const hasMore = messages.length === limit;
    const cursor = messages.length > 0 ? messages[0].timestamp : null;

    return NextResponse.json({ messages, hasMore, cursor });
  } catch (error) {
    console.error("Erro ao buscar mensagens:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { role, content } = await request.json();

    if (!role || !content) {
      return NextResponse.json(
        { error: "Role e content são obrigatórios" },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const messageRepo = new MessageRepository(db);
    const conversationRepo = new ConversationRepository(db);

    // Criar mensagem
    const messageId = messageRepo.create(id, role, content);

    // Atualizar timestamp da conversa
    conversationRepo.updateTimestamp(id);

    // Gerar embedding em background (apenas para mensagens do usuário e assistente)
    if (role === "user" || role === "assistant") {
      addMessageEmbedding(messageId, content).catch((error) => {
        console.error("Erro ao gerar embedding:", error);
      });
    }

    return NextResponse.json({ id: messageId });
  } catch (error) {
    console.error("Erro ao criar mensagem:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
