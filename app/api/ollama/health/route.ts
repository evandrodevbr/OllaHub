import { NextResponse } from "next/server";
import { listModelsViaSdk, listModelsViaHttp } from "@/lib/ollama";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    try {
      await listModelsViaSdk();
      return NextResponse.json({ ok: true });
    } catch {
      await listModelsViaHttp();
      return NextResponse.json({ ok: true });
    }
  } catch {
    return NextResponse.json({ ok: false });
  }
}
