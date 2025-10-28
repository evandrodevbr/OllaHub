export type ChatRole = "user" | "assistant" | "system";

export type Message = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
};

export type ChatState = {
  messages: Message[];
  selectedModel: string | null;
  isStreaming: boolean;
  streamingContent: string;
};

export function createMessage(role: ChatRole, content: string): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
  };
}

export function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min atrás`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;

  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

export function convertToOllamaMessages(messages: Message[]) {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

export function createSystemMessage(content: string): Message {
  return createMessage("system", content);
}
