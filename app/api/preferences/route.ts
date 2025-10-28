import { NextRequest, NextResponse } from "next/server";
import { getPreferences, setPreferences } from "@/lib/preferences";

// Estrutura de preferências
type UserPreferences = {
  selectedModel: string | null;
  systemPrompt: string;
  device: "auto" | "cpu" | "gpu";
  gpuIndex: number;
  numGpu: number;
};

// GET - Buscar preferências
export async function GET(request: NextRequest) {
  try {
    const userId = "default"; // Pode ser expandido para multi-usuário
    const prefs = await getPreferences(userId);
    return NextResponse.json(prefs);
  } catch (error) {
    console.error("Erro ao buscar preferências:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

// POST - Salvar preferências
export async function POST(request: NextRequest) {
  try {
    const userId = "default";
    const prefs = await request.json();
    await setPreferences(userId, prefs);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao salvar preferências:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
