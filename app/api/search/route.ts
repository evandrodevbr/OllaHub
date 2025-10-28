import { NextRequest, NextResponse } from "next/server";
import { semanticSearch } from "@/lib/vector-search";

export async function POST(request: NextRequest) {
  try {
    const { query, limit = 5 } = await request.json();

    if (!query) {
      return NextResponse.json(
        { error: "Query é obrigatória" },
        { status: 400 }
      );
    }

    const results = await semanticSearch(query, limit);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Erro na busca semântica:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
