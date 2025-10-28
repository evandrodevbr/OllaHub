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
    const db = getDatabase();
    const messageRepo = new MessageRepository(db);

    const messages = messageRepo.findByConversation(id);

    return NextResponse.json(messages);
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
