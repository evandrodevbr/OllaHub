import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/database/client";
import { ConversationRepository } from "@/database/repositories/conversation";
import { MessageRepository } from "@/database/repositories/message";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDatabase();
    const conversationRepo = new ConversationRepository(db);
    const messageRepo = new MessageRepository(db);

    const conversation = conversationRepo.findById(id);
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversa não encontrada" },
        { status: 404 }
      );
    }

    const messages = messageRepo.findByConversation(id);

    return NextResponse.json({
      conversation,
      messages,
    });
  } catch (error) {
    console.error("Erro ao buscar conversa:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDatabase();
    const conversationRepo = new ConversationRepository(db);

    conversationRepo.delete(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar conversa:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
