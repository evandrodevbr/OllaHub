import { ModeToggle } from "@/components/mode-toggle";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { ClientHome } from "@/components/ClientHome";

async function fetchModels() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/ollama/models`, {
      cache: "no-store",
    });
    if (!res.ok) return { offline: true, models: [] };
    return res.json();
  } catch {
    return { offline: true, models: [] };
  }
}

export default async function Home() {
  const { offline, models } = await fetchModels();
  return <ClientHome offline={offline} models={models} />;
}
