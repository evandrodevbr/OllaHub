import { NextRequest, NextResponse } from "next/server";
import { Ollama } from "ollama";
import { OLLAMA_HOST } from "@/lib/ollama";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const model = url.searchParams.get("model");
    if (!model) {
      return NextResponse.json({ error: "model required" }, { status: 400 });
    }

    const client = new Ollama({ host: OLLAMA_HOST });
    await client.chat({
      model,
      messages: [{ role: "system", content: "warm" }],
      stream: false,
      options: { keep_alive: "5m" },
    });

    return NextResponse.json({ warmed: true });
  } catch (e) {
    return NextResponse.json({ warmed: false }, { status: 200 });
  }
}


