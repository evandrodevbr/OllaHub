import fs from "node:fs/promises";
import path from "node:path";

type CatalogModel = {
  name: string;
  description?: string;
  capabilities?: string[];
  parameter_sizes?: string[];
  pulls?: string;
  tags_count?: number;
  last_updated?: string;
  url?: string;
};

type CatalogFile = {
  models?: CatalogModel[];
};

let cachedModels: CatalogModel[] | null = null;
let cachedMtimeMs: number | null = null;

function resolveCatalogPath(): string {
  // Arquivo fica em data/models.json na raiz do projeto
  return path.join(process.cwd(), "data", "models.json");
}

export async function getCatalogModels(): Promise<CatalogModel[]> {
  try {
    const catalogPath = resolveCatalogPath();
    const stat = await fs.stat(catalogPath);

    // Cache simples por mtime
    if (cachedModels && cachedMtimeMs && stat.mtimeMs === cachedMtimeMs) {
      return cachedModels;
    }

    const raw = await fs.readFile(catalogPath, "utf-8");
    const json = JSON.parse(raw) as CatalogFile;
    const models = Array.isArray(json.models) ? json.models : [];

    cachedModels = models;
    cachedMtimeMs = stat.mtimeMs;
    return models;
  } catch (error) {
    // Em caso de erro, retorne array vazio para não quebrar a UI
    return [];
  }
}


