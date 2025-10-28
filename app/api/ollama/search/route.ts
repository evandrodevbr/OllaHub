import { NextRequest, NextResponse } from "next/server";
import { searchRemoteModels } from "@/lib/ollama";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || undefined;

    const remoteModels = await searchRemoteModels(query);

    return NextResponse.json({
      success: true,
      models: remoteModels,
    });
  } catch (error) {
    console.error("Error searching remote models:", error);
    return NextResponse.json(
      { error: "Failed to search remote models" },
      { status: 500 }
    );
  }
}
