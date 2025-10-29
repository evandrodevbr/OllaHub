import { NextRequest, NextResponse } from "next/server";
import { getCatalogModels } from "@/lib/catalog";

// Cache simples em memória para evitar múltiplos scrapes por nome
const TAGS_CACHE = new Map<string, { tags: string[]; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

async function fetchTagsFromPage(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const html = await res.text();

    // Heurística best-effort: procurar padrões de tag na página
    // Exemplos possíveis: ":7b", ":8b", ":q4_K_S", etc.
    // Evitar listas enormes ou falsas-positivas: limitar tamanho e caracteres
    const tagRegex = /:\s*([A-Za-z0-9._-]{1,32})/g;
    const found = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1];
      if (tag && !/^(http|https)$/i.test(tag)) {
        found.add(tag);
      }
    }

    // Retornar até 50 tags para não sobrecarregar UI
    return Array.from(found).slice(0, 50);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = (searchParams.get("name") || "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Missing name" },
        { status: 400 },
      );
    }

    // Cache
    const cached = TAGS_CACHE.get(name);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ success: true, name, tags: cached.tags });
    }

    const catalog = await getCatalogModels();
    const entry = catalog.find((m) => m.name === name);
    const url = entry?.url;

    // Sem URL conhecida → não conseguimos buscar tags no registro
    if (!url) {
      TAGS_CACHE.set(name, { tags: [], expiresAt: now + CACHE_TTL_MS });
      return NextResponse.json({ success: true, name, tags: [] });
    }

    const tags = await fetchTagsFromPage(url);
    TAGS_CACHE.set(name, { tags, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json({ success: true, name, url, tags });
  } catch (error) {
    console.error("Error fetching model tags:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      { status: 500 },
    );
  }
}


