import { NextRequest, NextResponse } from "next/server";
import { getSavedRemoteModels } from "@/lib/user-remote-models";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || undefined;

    const saved = await getSavedRemoteModels();
    const q = (query || "").trim().toLowerCase();
    const filtered = q
      ? saved.filter((m) => m.name.toLowerCase().includes(q))
      : saved;

    const models = filtered.map((m) => ({
      name: m.name,
      description: m.description,
      url: m.url,
      tags_count: m.tags_count,
      installed: m.installed === true,
      remote: true,
    }));

    return NextResponse.json({ success: true, models });
  } catch (error) {
    console.error("Error searching remote models:", error);
    return NextResponse.json(
      { error: "Failed to search remote models" },
      { status: 500 }
    );
  }
}
