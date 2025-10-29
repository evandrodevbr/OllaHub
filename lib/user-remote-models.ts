import fs from "node:fs/promises";
import path from "node:path";

export type SavedRemoteModel = {
  name: string; // full ref, e.g., owner/model:tag or model:tag
  description?: string;
  url?: string;
  tags_count?: number;
  installed?: boolean;
  lastUsedAt?: string; // ISO
};

type SavedRemoteFile = {
  models: SavedRemoteModel[];
};

function getFilePath() {
  return path.join(process.cwd(), "database", "user-remote-models.json");
}

async function ensureFile(): Promise<void> {
  const file = getFilePath();
  try {
    await fs.access(file);
  } catch {
    const initial: SavedRemoteFile = { models: [] };
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(initial, null, 2), "utf-8");
  }
}

export async function getSavedRemoteModels(): Promise<SavedRemoteModel[]> {
  await ensureFile();
  const raw = await fs.readFile(getFilePath(), "utf-8");
  try {
    const json = JSON.parse(raw) as SavedRemoteFile;
    return Array.isArray(json.models) ? json.models : [];
  } catch {
    return [];
  }
}

export async function addSavedRemoteModel(entry: SavedRemoteModel): Promise<void> {
  await ensureFile();
  const current = await getSavedRemoteModels();
  const nowIso = new Date().toISOString();
  const idx = current.findIndex((m) => m.name === entry.name);
  const merged: SavedRemoteModel = {
    ...entry,
    installed: entry.installed ?? false,
    lastUsedAt: entry.lastUsedAt ?? nowIso,
  };
  if (idx >= 0) {
    current[idx] = { ...current[idx], ...merged, lastUsedAt: nowIso };
  } else {
    current.unshift(merged);
  }
  const toWrite: SavedRemoteFile = { models: current.slice(0, 500) };
  await fs.writeFile(getFilePath(), JSON.stringify(toWrite, null, 2), "utf-8");
}


