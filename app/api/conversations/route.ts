import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/database/client";
import { ConversationRepository } from "@/database/repositories/conversation";
import { MessageRepository } from "@/database/repositories/message";
import { generateChatTitle } from "@/lib/embeddings";

export async function GET() {
  try {
    const db = getDatabase();
    const conversationRepo = new ConversationRepository(db);

    const conversations = conversationRepo.findAll();

    return NextResponse.json(conversations);
  } catch (error) {
    console.error("Erro ao buscar conversas:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { model, firstMessage } = await request.json();

    if (!model) {
      return NextResponse.json(
        { error: "Modelo é obrigatório" },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const conversationRepo = new ConversationRepository(db);

    // Gerar título se primeira mensagem fornecida
    let title = "Nova conversa";
    if (firstMessage) {
      title = await generateChatTitle(firstMessage);
    }

    const conversationId = conversationRepo.create(model, title);

    return NextResponse.json({ id: conversationId, title });
  } catch (error) {
    console.error("Erro ao criar conversa:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
